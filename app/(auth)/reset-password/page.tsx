import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Set a new password" };

/**
 * Better Auth's callback lands here.
 *
 * It validates the token first and redirects with `?token=` when the token is
 * live, or `?error=INVALID_TOKEN` when it is not, so both cases arrive as query
 * parameters rather than as anything this page has to check itself.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return <ResetPasswordForm token={token ?? null} linkError={Boolean(error)} />;
}
