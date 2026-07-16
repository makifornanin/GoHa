import { redirect } from "next/navigation";

import { usersRepo } from "@/db";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Create owner account" };

/**
 * One-time owner bootstrap. Registration is only available until the owner
 * account exists; after that this route redirects to sign-in. Combined with the
 * `user.create.before` hook in lib/auth.ts, public sign-up is effectively closed
 * (CLAUDE.md section 1: single-owner app).
 */
export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/today");

  // Owner already exists -> bootstrap is closed.
  if (await usersRepo.hasAnyUser()) redirect("/login");

  return <AuthForm mode="register" redirectTo="/today" />;
}
