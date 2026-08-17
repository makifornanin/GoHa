/**
 * The automation rate-limit policy, as a pure decision.
 *
 * "Rate limit it" was one of the guide's rules for the one place this app grows
 * a public surface. The counting is done in SQL (see
 * `automationRepo.countRequestsSince`), which is what makes the limit hold
 * across more than one instance; what to do with that count lives here so it
 * can be tested without a database.
 */

/** Requests allowed per token per window. A cron-driven automation needs a handful. */
export const RATE_LIMIT_MAX = 60;
/** Length of the window, in seconds. */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

export type RateDecision = {
  allowed: boolean;
  /** Requests left in the window after this one, never below zero. */
  remaining: number;
  /** Seconds until the window can be assumed clear, for a Retry-After header. */
  retryAfterSeconds: number;
};

export function rateLimitDecision(
  recentRequests: number,
  max: number = RATE_LIMIT_MAX,
  windowSeconds: number = RATE_LIMIT_WINDOW_SECONDS,
): RateDecision {
  const used = Math.max(0, Math.floor(recentRequests));
  const allowed = used < max;
  return {
    allowed,
    // The request being decided counts against the allowance, so a caller that
    // reads `remaining: 0` knows the next one will be refused.
    remaining: Math.max(0, max - used - 1),
    retryAfterSeconds: allowed ? 0 : windowSeconds,
  };
}

/** The start of the current window, given "now". */
export function windowStart(
  now: Date = new Date(),
  windowSeconds: number = RATE_LIMIT_WINDOW_SECONDS,
): Date {
  return new Date(now.getTime() - windowSeconds * 1000);
}
