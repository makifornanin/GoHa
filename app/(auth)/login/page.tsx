import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { appSettingsRepo, usersRepo } from "@/db";
import { safeRedirectPath } from "@/lib/redirect";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  // Already signed in (e.g. a still-valid session): skip the form.
  // `safeRedirectPath` rather than a startsWith("/") check, which accepted
  // protocol-relative values like //attacker.example (audit R-09).
  if (await getCurrentUser()) {
    redirect(safeRedirectPath(redirectTo));
  }

  /*
   * GoHa is single-owner and sign-up closes permanently once the owner exists
   * (see the user.create.before hook in lib/auth.ts). Advertising "create the
   * owner account" after that point offers a route that always fails, which
   * reads as a broken app rather than a closed door. The endpoint stays
   * protected regardless; this only stops the screen promising something it
   * cannot deliver.
   */
  // The footer offers account creation when it would actually work: either
  // nobody has signed up yet, or the owner has opened sign-up to anyone.
  const [hasUsers, mode] = await Promise.all([
    usersRepo.hasAnyUser(),
    appSettingsRepo.getSignupMode(),
  ]);
  const canBootstrap = !hasUsers || mode === "open";

  return <AuthForm mode="login" redirectTo={redirectTo} canBootstrap={canBootstrap} />;
}
