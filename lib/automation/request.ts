import "server-only";

import { automationRepo, type AutomationToken, type UserSettings } from "@/db";
import type { AutomationScope } from "@/db/schema";
import { zonedToday } from "@/lib/date";
import { sabbathContext, type SabbathContext } from "@/lib/sabbath";
import { getUserSettingsCached } from "@/lib/user-settings";

import {
  rateLimitDecision,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
  windowStart,
} from "./rate-limit";
import { bearerToken, hashesMatch, hashToken, isTokenUsable, tokenPrefix } from "./token";

/**
 * The gate every automation endpoint passes through.
 *
 * Rules this surface keeps, all of them from the automation guide's list for
 * the one place GoHa becomes reachable from outside:
 *
 *  - Bearer token in the Authorization header, never a query string, because a
 *    query string ends up in logs and history.
 *  - The token is looked up by its public prefix and confirmed by a
 *    constant-time hash comparison.
 *  - The user is derived FROM THE TOKEN. There is no caller-supplied user id
 *    anywhere on this surface, so there is nothing to forge.
 *  - Read endpoints require a token; the single write endpoint additionally
 *    requires the `read_write` scope.
 *  - Every request is rate limited and logged, answered or refused.
 *
 * Failures answer with the same shape and never explain which part was wrong:
 * "no such token" and "revoked token" are one answer, because the difference is
 * only useful to someone guessing.
 */

export type AuthedAutomation = {
  token: AutomationToken;
  userId: string;
  /** The owner's day, resolved once per request from their saved timezone. */
  context: SabbathContext;
  settings: UserSettings;
};

export type AutomationFailure = { response: Response };

const UNAUTHORIZED = { error: "Unauthorized." };

function json(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      // Nothing on this surface is cacheable: it is one owner's live state.
      "Cache-Control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

export function automationJson(body: unknown, init: ResponseInit = {}): Response {
  return json(body, init);
}

/**
 * Authenticate, authorize, and rate limit. Returns either the caller's identity
 * or the exact Response to send back.
 */
export async function authenticateAutomation(
  request: Request,
  options: { route: string; scope?: AutomationScope } = { route: "unknown" },
): Promise<AuthedAutomation | AutomationFailure> {
  const presented = bearerToken(request.headers.get("authorization"));
  if (!presented) {
    return { response: json(UNAUTHORIZED, { status: 401 }) };
  }

  const now = new Date();
  let candidates;
  try {
    candidates = await automationRepo.findTokensByPrefix(tokenPrefix(presented));
  } catch (error) {
    // The lookup itself failed (no database, or the automation tables have not
    // been migrated yet). Answer in JSON like everything else on this surface:
    // a bare 500 with an HTML body is unreadable to the thing calling it, and
    // 503 says "try again" rather than "your credential is wrong".
    console.error(`automation ${options.route} could not verify a token`, error);
    return {
      response: json({ error: "Automation is unavailable. Try again shortly." }, { status: 503 }),
    };
  }

  const presentedHash = hashToken(presented);
  const token = candidates.find((candidate) => hashesMatch(candidate.tokenHash, presentedHash));

  if (!token || !isTokenUsable(token, now)) {
    // A revoked or expired token is answered exactly like an unknown one, and
    // nothing is logged against a user that may not be the caller's.
    return { response: json(UNAUTHORIZED, { status: 401 }) };
  }

  if (options.scope === "read_write" && token.scope !== "read_write") {
    await automationRepo.recordRequest({
      userId: token.userId,
      tokenId: token.id,
      route: options.route,
      status: 403,
    });
    return {
      response: json(
        { error: "This token is read-only. Create a read and write token for this." },
        { status: 403 },
      ),
    };
  }

  const used = await automationRepo.countRequestsSince(token.id, windowStart(now));
  const decision = rateLimitDecision(used);
  if (!decision.allowed) {
    await automationRepo.recordRequest({
      userId: token.userId,
      tokenId: token.id,
      route: options.route,
      status: 429,
    });
    return {
      response: json(
        { error: `Rate limit exceeded: ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_SECONDS}s.` },
        {
          status: 429,
          headers: {
            "Retry-After": String(decision.retryAfterSeconds),
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
            "X-RateLimit-Remaining": "0",
          },
        },
      ),
    };
  }

  // The owner's day, resolved once per request. Every endpoint below buckets
  // dates from THIS, never from a hard-coded zone (Guide 01, step 2.4).
  const settings = await getUserSettingsCached(token.userId);
  const localDate = zonedToday(now, settings.timezone);

  return {
    token,
    userId: token.userId,
    settings,
    context: sabbathContext({
      sabbathDay: settings.sabbathDay,
      localDate,
      timezone: settings.timezone,
    }),
  };
}

/**
 * The envelope every automation response carries (Guide 07, step 2.1).
 *
 * `goha-lib-guard` in n8n reads exactly these three fields and branches on
 * them, so they are attached here rather than assembled per endpoint: one
 * forgotten spread and a workflow would think every day was a working day.
 */
export function withContext(auth: AuthedAutomation, body: Record<string, unknown>): Response {
  return automationJson({ ...auth.context, ...body });
}

/**
 * The quiet answer for a work endpoint on the rest day: 200, empty, and
 * labelled. Not an error, because nothing went wrong; there is simply nothing
 * to say today.
 */
export function sabbathSilence(auth: AuthedAutomation): Response {
  return withContext(auth, { sabbath: true, items: [] });
}

/**
 * The answer when the owner has switched this notification off in Settings.
 *
 * The API enforces its own toggles (Guide 00, phase B). Leaving that to the
 * workflows would make the Settings controls cosmetic: a switch that only stops
 * a message if some flow out there remembers to check it is not a switch.
 */
export function disabledSilence(auth: AuthedAutomation, setting: string): Response {
  return withContext(auth, { enabled: false, setting, items: [] });
}

export function isFailure(
  result: AuthedAutomation | AutomationFailure,
): result is AutomationFailure {
  return "response" in result;
}

/**
 * Record the outcome and return the response.
 *
 * Logging happens after the work, with the real status, so the audit trail in
 * Settings says what actually happened rather than what was attempted. A
 * logging failure never costs the caller its answer: the data is already
 * correct, and the log is an operational nicety.
 */
export async function finishAutomation(
  auth: AuthedAutomation,
  route: string,
  response: Response,
): Promise<Response> {
  try {
    await Promise.all([
      automationRepo.recordRequest({
        userId: auth.userId,
        tokenId: auth.token.id,
        route,
        status: response.status,
      }),
      automationRepo.touchToken(auth.token.id),
    ]);
  } catch (error) {
    console.error("automation request logging failed", error);
  }
  return response;
}

/** One place for the "something broke" answer, so no endpoint leaks internals. */
export function automationError(route: string, error: unknown): Response {
  console.error(`automation ${route} failed`, error);
  return json({ error: "Something went wrong." }, { status: 500 });
}
