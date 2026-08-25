"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { spring } from "@/lib/motion";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Both passwords must match.",
    path: ["confirm"],
  });

/**
 * Set a new password from a reset link.
 *
 * `token` comes from Better Auth's own callback, which has already checked that
 * it exists and has not expired before redirecting here. That check is not
 * authorization: the token is spent by the POST below, server-side, and this
 * screen never learns whose account it belongs to.
 *
 * A missing or rejected token is a dead end on purpose. There is no way to
 * retry from here without a fresh link, because an inline retry would mean
 * holding a reset credential in the page across attempts.
 */
export function ResetPasswordForm({ token, linkError }: { token: string | null; linkError: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (linkError || !token) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.smooth}
        className="mx-auto w-full max-w-sm"
      >
        <h1 className="text-title-2 text-label">That link no longer works</h1>
        <p className="mt-2 text-callout text-label-secondary">
          Reset links can be used once and expire after an hour. Request a new one and it will
          work straight away.
        </p>
        <div className="mt-8">
          <Button className="w-full" onClick={() => router.push("/forgot-password")}>
            Request a new link
          </Button>
        </div>
        <p className="mt-8 text-callout text-label-secondary">
          <Link className="font-medium text-blue hover:underline" href="/login">
            Back to sign in
          </Link>
        </p>
      </motion.div>
    );
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.smooth}
        className="mx-auto w-full max-w-sm"
      >
        <h1 className="text-title-2 text-label">Password updated</h1>
        <p className="mt-2 text-callout text-label-secondary">
          You can sign in with your new password now. Any other devices that were signed in have
          been signed out.
        </p>
        <div className="mt-8">
          <Button className="w-full" onClick={() => router.push("/login")}>
            Go to sign in
          </Button>
        </div>
      </motion.div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the password and try again.");
      return;
    }

    setPending(true);
    const { error: resetError } = await authClient
      .resetPassword({ newPassword: parsed.data.password, token: token! })
      .catch(() => ({ error: { message: "" } }));
    setPending(false);

    if (resetError) {
      // The token is gone either way once the server has looked at it, so this
      // sends the reader for a fresh one rather than inviting a retry that
      // cannot succeed.
      setError("That link has expired or has already been used. Request a new one.");
      return;
    }
    setDone(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className="mx-auto w-full max-w-sm"
    >
      <h1 className="text-title-2 text-label">Set a new password</h1>
      <p className="mt-2 text-callout text-label-secondary">
        Choose something you have not used here before.
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
        <label className="block space-y-1.5">
          <span className="text-subhead text-label-secondary">New password</span>
          <Input
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-subhead text-label-secondary">Confirm new password</span>
          <Input
            type="password"
            name="confirm"
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
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
          Update password
        </Button>
      </form>
    </motion.div>
  );
}
