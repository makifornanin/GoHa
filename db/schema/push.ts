import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { auditTimestamps, primaryId } from "./_shared";
import { notificationLog } from "./automation";
import { user } from "./auth";

/**
 * A browser Push API subscription belonging to one authenticated GoHa user.
 *
 * The endpoint and encryption keys are capabilities required by the Web Push
 * protocol, not login credentials. They are deliberately kept behind the
 * repository boundary and must never be rendered in Settings, logged, or put
 * in a QR code. One user can own many rows (phone, tablet, another browser),
 * while an endpoint has exactly one owner across the whole installation.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    /** The browser-provided expiry instant, when the push service supplies one. */
    expirationTime: timestamp({ withTimezone: true }),
    /** A user-facing name only; no user-agent or fingerprint is collected. */
    deviceLabel: text(),
    /** Invalid or explicitly disabled rows are excluded from every send. */
    disabledAt: timestamp({ withTimezone: true }),
    lastSuccessAt: timestamp({ withTimezone: true }),
    lastFailureAt: timestamp({ withTimezone: true }),
    failureCount: integer().notNull().default(0),
    ...auditTimestamps,
  },
  (t) => [
    unique("push_subscriptions_endpoint_uq").on(t.endpoint),
    index("push_subscriptions_user_id_idx").on(t.userId),
    index("push_subscriptions_active_user_idx")
      .on(t.userId)
      .where(sql`${t.disabledAt} is null`),
    check(
      "push_subscriptions_endpoint_shape",
      sql`char_length(${t.endpoint}) between 9 and 2048 and ${t.endpoint} ~ '^https://'`,
    ),
    check(
      "push_subscriptions_p256dh_shape",
      sql`char_length(${t.p256dh}) between 80 and 128 and ${t.p256dh} ~ '^[A-Za-z0-9_-]+={0,2}$'`,
    ),
    check(
      "push_subscriptions_auth_shape",
      sql`char_length(${t.auth}) between 16 and 64 and ${t.auth} ~ '^[A-Za-z0-9_-]+={0,2}$'`,
    ),
    check(
      "push_subscriptions_device_label_length",
      sql`${t.deviceLabel} is null or char_length(${t.deviceLabel}) <= 80`,
    ),
    check("push_subscriptions_failure_count_nonnegative", sql`${t.failureCount} >= 0`),
  ],
);

/**
 * One short-lived setup intent per user.
 *
 * Regenerating replaces this row, immediately invalidating the prior secret.
 * Only SHA-256 and a harmless display prefix are stored. Possession of the
 * secret is never authentication: consumption also requires the matching
 * authenticated user id.
 */
export const pushPairingSessions = pgTable(
  "push_pairing_sessions",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secretHash: text().notNull(),
    secretPrefix: text().notNull(),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    ...auditTimestamps,
  },
  (t) => [
    unique("push_pairing_sessions_user_id_uq").on(t.userId),
    unique("push_pairing_sessions_secret_hash_uq").on(t.secretHash),
    index("push_pairing_sessions_expires_at_idx").on(t.expiresAt),
    check(
      "push_pairing_sessions_hash_shape",
      sql`char_length(${t.secretHash}) = 64 and ${t.secretHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "push_pairing_sessions_prefix_length",
      sql`char_length(${t.secretPrefix}) between 10 and 20`,
    ),
    check(
      "push_pairing_sessions_lifetime",
      sql`${t.expiresAt} > ${t.issuedAt} and ${t.expiresAt} <= ${t.issuedAt} + interval '15 minutes'`,
    ),
    check(
      "push_pairing_sessions_consumed_after_issue",
      sql`${t.consumedAt} is null or ${t.consumedAt} >= ${t.issuedAt}`,
    ),
  ],
);

/**
 * Per-notification, per-endpoint delivery state.
 *
 * `notification_log` prevents two logical notifications from being created.
 * This table handles the next level down: one logical notification may fan out
 * to several devices, and a partial retry must not resend to devices already
 * accepted by their push provider. A short lease also prevents concurrent
 * workers from sending the same device attempt at once.
 *
 * The endpoint itself is not copied. Its SHA-256 fingerprint is enough for the
 * idempotency key and remains after a dead subscription is deleted; the nullable
 * FK uses SET NULL so terminal delivery evidence is retained.
 */
export const pushDeliveries = pgTable(
  "push_deliveries",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    notificationId: uuid()
      .notNull()
      .references(() => notificationLog.id, { onDelete: "cascade" }),
    subscriptionId: uuid().references(() => pushSubscriptions.id, { onDelete: "set null" }),
    subscriptionEndpointHash: text().notNull(),
    attemptCount: integer().notNull().default(0),
    lastAttemptAt: timestamp({ withTimezone: true }).notNull(),
    /** Random owner of the current short delivery lease. Never leaves the server. */
    attemptToken: uuid(),
    attemptExpiresAt: timestamp({ withTimezone: true }),
    acceptedAt: timestamp({ withTimezone: true }),
    lastFailureAt: timestamp({ withTimezone: true }),
    permanentFailureAt: timestamp({ withTimezone: true }),
    /** Provider status only. Provider bodies and exception messages are never stored. */
    lastStatusCode: smallint(),
    /** A bounded application code such as provider_410 or network_error. */
    lastErrorCode: text(),
    ...auditTimestamps,
  },
  (t) => [
    unique("push_deliveries_notification_endpoint_uq").on(
      t.notificationId,
      t.subscriptionEndpointHash,
    ),
    index("push_deliveries_user_notification_idx").on(t.userId, t.notificationId),
    index("push_deliveries_subscription_idx").on(t.subscriptionId),
    index("push_deliveries_retryable_idx")
      .on(t.userId, t.attemptExpiresAt)
      .where(sql`${t.acceptedAt} is null and ${t.permanentFailureAt} is null`),
    check(
      "push_deliveries_endpoint_hash_shape",
      sql`char_length(${t.subscriptionEndpointHash}) = 64 and ${t.subscriptionEndpointHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check("push_deliveries_attempt_count_nonnegative", sql`${t.attemptCount} >= 0`),
    check(
      "push_deliveries_lease_pair",
      sql`(${t.attemptToken} is null) = (${t.attemptExpiresAt} is null)`,
    ),
    check(
      "push_deliveries_terminal_state",
      sql`not (${t.acceptedAt} is not null and ${t.permanentFailureAt} is not null)`,
    ),
    check(
      "push_deliveries_terminal_has_no_lease",
      sql`(${t.acceptedAt} is null and ${t.permanentFailureAt} is null) or (${t.attemptToken} is null and ${t.attemptExpiresAt} is null)`,
    ),
    check(
      "push_deliveries_status_code_range",
      sql`${t.lastStatusCode} is null or ${t.lastStatusCode} between 100 and 599`,
    ),
    check(
      "push_deliveries_error_code_length",
      sql`${t.lastErrorCode} is null or char_length(${t.lastErrorCode}) <= 64`,
    ),
  ],
);
