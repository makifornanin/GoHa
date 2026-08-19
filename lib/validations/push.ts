import { z } from "zod";

export const PUSH_DEVICE_LABEL_MAX = 80;
export const PUSH_ENDPOINT_MAX = 2048;
export const PUSH_TITLE_MAX = 120;
export const PUSH_BODY_MAX = 500;
export const PUSH_DEEP_LINK_MAX = 500;

const base64UrlKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Use a valid Web Push key.");

const p256dhSchema = base64UrlKeySchema
  .min(80, "The p256dh key is too short.")
  .max(128, "The p256dh key is too long.");

const authSchema = base64UrlKeySchema
  .min(16, "The auth key is too short.")
  .max(64, "The auth key is too long.");

/** Syntactic validation here; async DNS/public-address checks happen server-side. */
const pushEndpointSchema = z
  .string()
  .trim()
  .min(9, "A push endpoint is required.")
  .max(PUSH_ENDPOINT_MAX, "The push endpoint is too long.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === "443")
      );
    } catch {
      return false;
    }
  }, "Use a secure HTTPS push endpoint.");

export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  expirationTime: z.number().int().nonnegative().finite().optional().nullable(),
  keys: z.object({
    p256dh: p256dhSchema,
    auth: authSchema,
  }),
  deviceLabel: z
    .string()
    .trim()
    .min(1)
    .max(PUSH_DEVICE_LABEL_MAX)
    .optional()
    .nullable(),
});

export type PushSubscriptionInput = z.input<typeof pushSubscriptionSchema>;

export const pushSubscriptionIdSchema = z.uuid();
export const pushNotificationIdSchema = z.uuid();

function isSafeRelativeAppPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const base = new URL("https://goha.invalid/");
    const resolved = new URL(value, base);
    return resolved.origin === base.origin && !resolved.username && !resolved.password;
  } catch {
    return false;
  }
}

export const pushNotificationPayloadSchema = z.object({
  title: z.string().trim().min(1).max(PUSH_TITLE_MAX),
  body: z.string().trim().min(1).max(PUSH_BODY_MAX),
  /** Same-origin route only; the service worker must never become an open redirect. */
  url: z
    .string()
    .trim()
    .max(PUSH_DEEP_LINK_MAX)
    .refine(isSafeRelativeAppPath, "Use a GoHa-relative notification route.")
    .default("/"),
  icon: z
    .string()
    .trim()
    .max(PUSH_DEEP_LINK_MAX)
    .refine(isSafeRelativeAppPath, "Use a GoHa-relative icon path.")
    .optional(),
  tag: z.string().trim().min(1).max(64).optional(),
});

export type PushNotificationPayload = z.infer<typeof pushNotificationPayloadSchema>;

export const pushUrgencySchema = z.enum(["very-low", "low", "normal", "high"]);
export const pushTtlSecondsSchema = z.number().int().min(0).max(60 * 60);
