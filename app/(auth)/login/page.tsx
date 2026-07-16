import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  // Already signed in (e.g. a still-valid session): skip the form.
  if (await getCurrentUser()) {
    redirect(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/today");
  }

  return <AuthForm mode="login" redirectTo={redirectTo} />;
}
