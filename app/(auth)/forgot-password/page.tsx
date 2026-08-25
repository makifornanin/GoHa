import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Reset your password" };

/**
 * Deliberately does NOT redirect a signed-in visitor away.
 *
 * Someone who is signed in on this device may still be resetting because they
 * cannot get in somewhere else. Bouncing them to /today would make the link on
 * the sign-in page do nothing for exactly the person using it.
 */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
