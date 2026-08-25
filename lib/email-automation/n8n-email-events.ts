import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Outbound email EVENTS to n8n.
 *
 * GoHa never sends email. It owns identity, account existence, reset tokens and
 * their lifetime, and it owns the decision that an email is warranted; n8n owns
 * presentation and Gmail delivery. That split is the whole point: moving any of
 * the left-hand list into a workflow would put authentication authority in a
 * place that cannot enforce it.
 *
 * Shaped after `lib/push/web-push.ts`: a factory over injected dependencies, so
 * a test drives the real code with a fake transport instead of reaching the
 * network, and a config reader that takes its environment as an argument.
 */

/** How long to wait on n8n before giving up. Matches PUSH_REQUEST_TIMEOUT_MS. */
export const EMAIL_EVENT_TIMEOUT_MS = 10_000;

/** Header carrying the shared secret. Mirrors the worker surface's bearer auth. */
export const EMAIL_EVENT_SECRET_HEADER = "authorization";

export const MIN_EMAIL_WEBHOOK_SECRET_LENGTH = 32;

export type EmailEventKind = "password_reset_requested" | "welcome_email";

export type EmailEventEnvironment = {
  N8N_PASSWORD_RESET_WEBHOOK_URL?: string;
  N8N_WELCOME_EMAIL_WEBHOOK_URL?: string;
  N8N_EMAIL_WEBHOOK_SECRET?: string;
};

export type EmailEventConfig = {
  passwordResetUrl: string | null;
  welcomeEmailUrl: string | null;
  secret: string;
};

export class EmailEventConfigurationError extends Error {
  constructor(readonly reason: "missing" | "invalid") {
    super(`n8n email webhook configuration is ${reason}`);
    this.name = "EmailEventConfigurationError";
  }
}

/**
 * Only https, and only an absolute URL.
 *
 * The secret travels in a header, so a plaintext hop would hand it to anyone on
 * the path. localhost is allowed because that is how the workflow is developed
 * against a local n8n.
 */
function validWebhookUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new EmailEventConfigurationError("invalid");
  }
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new EmailEventConfigurationError("invalid");
  }
  return parsed.toString();
}

export function readEmailEventConfig(
  env: EmailEventEnvironment = process.env as unknown as EmailEventEnvironment,
): EmailEventConfig {
  const secret = env.N8N_EMAIL_WEBHOOK_SECRET?.trim();
  if (!secret) throw new EmailEventConfigurationError("missing");
  if (secret.length < MIN_EMAIL_WEBHOOK_SECRET_LENGTH) {
    throw new EmailEventConfigurationError("invalid");
  }
  return {
    passwordResetUrl: validWebhookUrl(env.N8N_PASSWORD_RESET_WEBHOOK_URL),
    welcomeEmailUrl: validWebhookUrl(env.N8N_WELCOME_EMAIL_WEBHOOK_URL),
    secret,
  };
}

/** Whether email events can be delivered at all, without throwing at a caller. */
export function emailEventsConfigured(
  env: EmailEventEnvironment = process.env as unknown as EmailEventEnvironment,
): boolean {
  try {
    const config = readEmailEventConfig(env);
    return Boolean(config.passwordResetUrl || config.welcomeEmailUrl);
  } catch {
    return false;
  }
}

/** Compare a presented secret in constant time, for the optional ack route. */
export function emailWebhookSecretMatches(
  presented: string | null,
  configured: string | undefined,
): boolean {
  if (!presented || !configured) return false;
  if (configured.length < MIN_EMAIL_WEBHOOK_SECRET_LENGTH) return false;
  const a = createHash("sha256").update(presented, "utf8").digest();
  const b = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(a, b);
}

export type PasswordResetEvent = {
  eventType: "password_reset_requested";
  eventId: string;
  recipientEmail: string;
  displayName: string | null;
  resetUrl: string;
  expiresInMinutes: number;
};

export type WelcomeEmailEvent = {
  eventType: "welcome_email";
  eventId: string;
  recipientEmail: string;
  displayName: string | null;
  createdAt: string;
};

export type EmailEvent = PasswordResetEvent | WelcomeEmailEvent;

export type EmailEventResult =
  | { delivered: true }
  | { delivered: false; reason: "unconfigured" | "http_error" | "network_error" };

export type EmailEventDependencies = {
  /** Injected so tests never touch the network. */
  fetchImpl: typeof fetch;
  getConfig: () => EmailEventConfig;
  /** Opaque per-event id. Injected because Math.random/uuid must be stubbable. */
  newEventId: () => string;
  now: () => Date;
  logger?: Pick<Console, "error" | "warn">;
};

export function defaultEmailEventDependencies(): EmailEventDependencies {
  return {
    fetchImpl: fetch,
    getConfig: () => readEmailEventConfig(),
    newEventId: () => randomUUID(),
    now: () => new Date(),
    logger: console,
  };
}

/**
 * What is safe to write to a log line.
 *
 * Never the reset URL and never the token inside it: logs are the one place a
 * single-use credential can quietly become a durable one. The event id is
 * opaque and is the handle for correlating with n8n.
 */
function safeLogContext(event: EmailEvent): Record<string, string> {
  return { eventType: event.eventType, eventId: event.eventId };
}

export function createEmailEventSender(dependencies: EmailEventDependencies): {
  send: (event: EmailEvent) => Promise<EmailEventResult>;
  buildPasswordResetEvent: (input: {
    recipientEmail: string;
    displayName: string | null;
    resetUrl: string;
    expiresInMinutes: number;
  }) => PasswordResetEvent;
  buildWelcomeEmailEvent: (input: {
    recipientEmail: string;
    displayName: string | null;
  }) => WelcomeEmailEvent;
} {
  const { fetchImpl, getConfig, newEventId, now, logger } = dependencies;

  function endpointFor(config: EmailEventConfig, event: EmailEvent): string | null {
    return event.eventType === "password_reset_requested"
      ? config.passwordResetUrl
      : config.welcomeEmailUrl;
  }

  /**
   * Deliver one event.
   *
   * NEVER throws. Both callers are in a security-sensitive position: the reset
   * path must answer identically whether or not the account exists, and the
   * sign-up path must not fail an account that was already created. An
   * exception escaping here would turn an n8n outage into either an account
   * existence oracle or a broken registration, so the failure is returned as a
   * value and logged instead.
   */
  async function send(event: EmailEvent): Promise<EmailEventResult> {
    let config: EmailEventConfig;
    try {
      config = getConfig();
    } catch {
      // Deliberately not an error log with the exception attached: the message
      // of a config error can name the variable, and this runs on every reset
      // attempt on a misconfigured deployment.
      logger?.warn("n8n email events are not configured", safeLogContext(event));
      return { delivered: false, reason: "unconfigured" };
    }

    const endpoint = endpointFor(config, event);
    if (!endpoint) {
      logger?.warn("no n8n webhook configured for event", safeLogContext(event));
      return { delivered: false, reason: "unconfigured" };
    }

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Bearer, matching the worker surface's convention.
          authorization: `Bearer ${config.secret}`,
          // Lets the workflow drop a replayed delivery without inspecting the body.
          "x-goha-event-id": event.eventId,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(EMAIL_EVENT_TIMEOUT_MS),
        cache: "no-store",
        redirect: "error",
      });

      if (!response.ok) {
        logger?.error("n8n email event rejected", {
          ...safeLogContext(event),
          status: response.status,
        });
        return { delivered: false, reason: "http_error" };
      }
      return { delivered: true };
    } catch (error) {
      // The thrown value is not spread into the log: a fetch error message can
      // contain the full request URL, which for the reset event carries the
      // token. Only its constructor name is useful anyway.
      logger?.error("n8n email event failed", {
        ...safeLogContext(event),
        error: error instanceof Error ? error.name : "unknown",
      });
      return { delivered: false, reason: "network_error" };
    }
  }

  return {
    send,
    buildPasswordResetEvent: ({ recipientEmail, displayName, resetUrl, expiresInMinutes }) => ({
      eventType: "password_reset_requested",
      eventId: newEventId(),
      recipientEmail,
      displayName,
      resetUrl,
      expiresInMinutes,
    }),
    buildWelcomeEmailEvent: ({ recipientEmail, displayName }) => ({
      eventType: "welcome_email",
      eventId: newEventId(),
      recipientEmail,
      displayName,
      createdAt: now().toISOString(),
    }),
  };
}

/** The process-wide sender, built lazily so importing this file reads no env. */
let cached: ReturnType<typeof createEmailEventSender> | null = null;

export function emailEventSender(): ReturnType<typeof createEmailEventSender> {
  cached ??= createEmailEventSender(defaultEmailEventDependencies());
  return cached;
}
