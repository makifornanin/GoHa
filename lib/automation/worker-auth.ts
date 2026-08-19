import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Authentication for the one central automation worker.
 *
 * This credential is deliberately unrelated to personal automation tokens.
 * It authorizes the trusted worker surface as a service, while job rows decide
 * which user and immutable target the worker may process. The caller never
 * supplies a user id.
 */

const UNAUTHORIZED = { error: "Unauthorized." };
export const WORKER_SECRET_MIN_LENGTH = 32;
export const WORKER_SECRET_MAX_LENGTH = 256;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function workerSecretMatches(presented: string | null, configured: string | undefined): boolean {
  if (!presented || !configured) return false;
  if (
    configured.length < WORKER_SECRET_MIN_LENGTH ||
    configured.length > WORKER_SECRET_MAX_LENGTH ||
    presented.length > WORKER_SECRET_MAX_LENGTH
  ) {
    return false;
  }
  return timingSafeEqual(digest(presented), digest(configured));
}

export function workerBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const value = match?.[1]?.trim();
  return value ? value : null;
}

export function authenticateAutomationWorker(request: Request): boolean {
  return workerSecretMatches(
    workerBearerToken(request.headers.get("authorization")),
    process.env.AUTOMATION_WORKER_SECRET,
  );
}

export function workerUnauthorized(): Response {
  return Response.json(UNAUTHORIZED, {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}

export function workerJson(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

/** Log only a bounded class name; exception messages may contain capabilities. */
export function workerErrorName(error: unknown): string {
  const candidate = error instanceof Error ? error.name : "UnknownError";
  const safeNames = new Set([
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "AbortError",
    "ZodError",
    "PostgresError",
    "DrizzleError",
    "NeonDbError",
    "VapidConfigurationError",
  ]);
  return safeNames.has(candidate) ? candidate : "UnknownError";
}
