import { toNextJsHandler } from "better-auth/next-js";

import { appSettingsRepo, invitesRepo, usersRepo } from "@/db";
import { auth } from "@/lib/auth";
import {
  hashInviteCode,
  inviteCodePrefix,
  inviteHashesMatch,
  inviteState,
  normalizeInviteCode,
} from "@/lib/invite";

/**
 * Better Auth catch-all route handler. Runs on the Node.js runtime (the default
 * for route handlers) because password hashing uses node crypto. Middleware
 * excludes `/api/auth/*` so these requests are never redirected.
 */
const handlers = toNextJsHandler(auth.handler);

/** The header the register form carries the invitation in. */
const INVITE_HEADER = "x-goha-invite";

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Who may create an account.
 *
 * This runs HERE, in front of Better Auth, because this handler is the only
 * path a sign-up can take. A check in the register page would be a check on the
 * form, and the raw endpoint would still be open to anyone who found it.
 *
 * Two ways through:
 *
 *  - The database has no accounts. This is the first run, and someone has to be
 *    able to become the owner.
 *  - A usable invitation is presented. The owner issues those.
 *
 * The invitation is CLAIMED before Better Auth is called, by a conditional
 * update that only one caller can win, and released again if the sign-up fails.
 * Checking first and marking used afterwards would let two people who opened
 * the same link at the same time both get an account.
 */
async function guardSignUp(request: Request): Promise<Response | null> {
  // Read the body once, and hand a fresh copy to Better Auth afterwards: a
  // Request body is a stream and can only be consumed a single time.
  const body = await request.clone().json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;

  if (!(await usersRepo.hasAnyUser())) return null;

  /*
   * Open sign-up, if the owner has chosen it.
   *
   * Read fresh on every attempt rather than cached, because closing sign-up is
   * something you do the moment you decide to, and a cached "open" would keep
   * the door ajar for as long as the cache lived.
   *
   * A failure here refuses rather than assumes: an unreadable policy is not
   * permission.
   */
  // Never throws; an unreadable policy resolves to invite only, so a database
  // problem cannot accidentally open sign-up. See the repository for why.
  const mode = await appSettingsRepo.getSignupMode();

  const presented = normalizeInviteCode(request.headers.get(INVITE_HEADER) ?? "");

  // Open: anyone may create an account. An invitation is still honoured when
  // one is presented, so an addressed link keeps its meaning and gets marked
  // used rather than sitting there looking unspent forever.
  if (mode === "open" && !presented) return null;

  if (!presented) {
    return json(
      { message: "GoHa is invite only. Ask the owner for an invitation link." },
      403,
    );
  }

  let candidates;
  try {
    candidates = await invitesRepo.findInvitesByPrefix(inviteCodePrefix(presented));
  } catch (error) {
    /*
     * The lookup itself failed: no database, or `invites` not migrated yet.
     *
     * This FAILS CLOSED, which is the only acceptable direction for a gate. An
     * error here must never fall through into "well, let them in"; it refuses
     * and says the door is temporarily stuck, which is a different sentence
     * from "your invitation is wrong" and sends the reader somewhere useful.
     */
    console.error("invite lookup failed", error);
    return json(
      { message: "Sign-up is temporarily unavailable. Please try again shortly." },
      503,
    );
  }

  const presentedHash = hashInviteCode(presented);
  const invite = candidates.find((candidate) => inviteHashesMatch(candidate.codeHash, presentedHash));

  if (!invite) {
    return json({ message: "That invitation is not valid." }, 403);
  }

  // Invitations are an install-wide owner capability. Older builds allowed
  // any signed-in account to create one, so fail closed for any legacy row
  // whose issuer is not the current owner.
  if (!(await appSettingsRepo.isOwner(invite.invitedBy))) {
    return json({ message: "That invitation is not valid." }, 403);
  }

  const state = inviteState(invite);
  if (state !== "usable") {
    // Named states, because "invalid" would send someone hunting for a typo in
    // a code that is simply used up.
    const reason =
      state === "used"
        ? "That invitation has already been used."
        : state === "expired"
          ? "That invitation has expired."
          : "That invitation was withdrawn.";
    return json({ message: reason }, 403);
  }

  // An invitation addressed to someone is for them, so a forwarded link cannot
  // be redeemed by a different person.
  if (invite.email && invite.email.toLowerCase() !== email) {
    return json({ message: "That invitation is for a different email address." }, 403);
  }

  let claimed;
  try {
    claimed = await invitesRepo.claimInvite(invite.id);
  } catch (error) {
    console.error("invite claim failed", error);
    return json({ message: "Sign-up is temporarily unavailable. Please try again shortly." }, 503);
  }
  if (!claimed) {
    return json({ message: "That invitation has already been used." }, 403);
  }

  // Hand the claim back to the caller so it can be settled after Better Auth
  // has either created the account or failed to.
  pendingClaims.set(request, claimed.id);
  return null;
}

/**
 * The claim in flight for a request, so the POST wrapper can accept or release
 * it once Better Auth has answered. Keyed by the Request object itself, which
 * is unique per call and garbage-collected with it.
 */
const pendingClaims = new WeakMap<Request, string>();

async function settleClaim(request: Request, response: Response): Promise<void> {
  const inviteId = pendingClaims.get(request);
  if (!inviteId) return;

  if (response.ok) {
    // Read the created account off the response so the invitation records who
    // it produced, rather than guessing from the email.
    const created = await response
      .clone()
      .json()
      .catch(() => null);
    const userId = created?.user?.id;
    if (typeof userId === "string") await invitesRepo.acceptInvite(inviteId, userId);
  } else {
    // The sign-up failed, so the invitation was never spent. Give it back.
    await invitesRepo.releaseInvite(inviteId);
  }
}

export async function GET(request: Request): Promise<Response> {
  return handlers.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  const isSignUp = new URL(request.url).pathname.includes("/sign-up");

  if (isSignUp) {
    const refusal = await guardSignUp(request);
    if (refusal) return refusal;
  }

  let response: Response;
  try {
    response = await handlers.POST(request);
  } catch (error) {
    // Better Auth threw rather than answering. The invitation must not be
    // burned by a failure that produced no account.
    await settleClaim(request, new Response(null, { status: 500 }));
    throw error;
  }

  if (isSignUp) await settleClaim(request, response);
  return response;
}
