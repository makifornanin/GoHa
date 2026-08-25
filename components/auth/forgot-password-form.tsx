"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { spring } from "@/lib/motion";

const schema = z.object({ email: z.email("Enter a valid email address.") });

/**
 * Ask for a reset link.
 *
 * The success screen is deliberately the same sentence no matter what happened:
 * a real account, an address nobody has ever used, or n8n being down. Anything
 * that varies with the answer, including a different error for an unknown
 * address, turns this form into a way to test whether someone has a GoHa
 * account. The server behaves the same way; this only avoids undoing it in the
 * browser.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = schema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      // The one error worth showing: the address is not an address. This says
      // nothing about whether an account exists.
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }

    setPending(true);
    try {
      await authClient.requestPasswordReset({
        email: parsed.data.email,
        // Where Better Auth sends the reader after it has checked the token.
        redirectTo: "/reset-password",
      });
    } catch {
      // Swallowed on purpose. A network or server failure must not read
      // differently from success, or the difference itself is the answer.
    } finally {
      setPending(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.smooth}
        className="mx-auto w-full max-w-sm"
      >
        <h1 className="text-title-2 text-label">Check your email</h1>
        <p className="mt-2 text-callout text-label-secondary">
          If an account exists for that address, we have sent password reset instructions. The
          link works once and expires in an hour.
        </p>
        <p className="mt-6 text-callout text-label-secondary">
          Nothing arrived? Check spam, or{" "}
          <button
            type="button"
            className="cursor-pointer font-medium text-blue hover:underline"
            onClick={() => setSent(false)}
          >
            try a different address
          </button>
          .
        </p>
        <p className="mt-8 text-callout text-label-secondary">
          <Link className="font-medium text-blue hover:underline" href="/login">
            Back to sign in
          </Link>
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className="mx-auto w-full max-w-sm"
    >
      <h1 className="text-title-2 text-label">Reset your password</h1>
      <p className="mt-2 text-callout text-label-secondary">
        Enter the email you sign in with and we will send you a link to set a new password.
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
        <label className="block space-y-1.5">
          <span className="text-subhead text-label-secondary">Email</span>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            required
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-lg bg-red/12 px-3 py-2 text-callout text-red">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Send reset link
        </Button>
      </form>

      <p className="mt-8 text-callout text-label-secondary">
        Remembered it?{" "}
        <Link className="font-medium text-blue hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </motion.div>
  );
}
