import { redirect } from "next/navigation";

import { appSettingsRepo, invitesRepo, usersRepo } from "@/db";
import { AuthForm } from "@/components/auth/auth-form";
import {
  hashInviteCode,
  inviteCodePrefix,
  inviteHashesMatch,
  inviteState,
  normalizeInviteCode,
} from "@/lib/invite";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Create your account" };

/**
 * Creating an account.
 *
 * Two ways in, and the page decides which one it is showing before anything is
 * typed, so nobody fills in a form that was never going to be accepted:
 *
 *  - Nobody has an account yet. This is the first run and whoever arrives
 *    becomes the owner.
 *  - An invitation is presented in the link. The owner issues those from
 *    Settings.
 *
 * The invitation is validated here for the MESSAGE only. What actually enforces
 * it is the auth route handler, which every sign-up request passes through
 * including a direct call to the raw endpoint; this page cannot be the gate
 * because a page is only the polite path to it.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  if (await getCurrentUser()) redirect("/today");

  const bootstrap = !(await usersRepo.hasAnyUser());
  if (bootstrap) {
    return <AuthForm mode="register" redirectTo="/today" />;
  }

  const { invite: presented } = await searchParams;
  const code = normalizeInviteCode(presented ?? "");
  const mode = await appSettingsRepo.getSignupMode();

  // Open sign-up: the form is the whole story, no invitation needed.
  if (mode === "open" && !code) {
    return <AuthForm mode="register" redirectTo="/today" />;
  }

  if (!code) {
    // No invitation, and the app already has accounts: say what the situation
    // is rather than bouncing to sign-in, which reads as "your link is broken".
    return (
      <AuthForm
        mode="register"
        redirectTo="/today"
        inviteRequired
        inviteError="GoHa is invite only. Ask whoever runs this GoHa for an invitation link."
      />
    );
  }

  const candidates = await invitesRepo.findInvitesByPrefix(inviteCodePrefix(code));
  const presentedHash = hashInviteCode(code);
  const invite = candidates.find((candidate) =>
    inviteHashesMatch(candidate.codeHash, presentedHash),
  );

  const state = invite ? inviteState(invite) : null;

  if (!invite || state !== "usable") {
    const message =
      state === "used"
        ? "That invitation has already been used."
        : state === "expired"
          ? "That invitation has expired. Ask for a new one."
          : state === "revoked"
            ? "That invitation was withdrawn."
            : "That invitation is not valid.";
    return <AuthForm mode="register" redirectTo="/today" inviteRequired inviteError={message} />;
  }

  return (
    <AuthForm
      mode="register"
      redirectTo="/today"
      inviteCode={code}
      // A locked invitation fills the address in and holds it, so the person
      // cannot accidentally sign up with a different one and be refused after
      // choosing a password.
      lockedEmail={invite.email}
    />
  );
}
