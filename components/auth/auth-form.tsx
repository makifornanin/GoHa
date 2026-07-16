"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";

import { Brand } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-label-sm uppercase text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name."),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/**
 * Email/password auth form for both sign-in and the one-time owner bootstrap.
 * Validates input with Zod before calling Better Auth, surfaces server errors,
 * and redirects to `redirectTo` (or /today) on success.
 */
export function AuthForm({
  mode,
  redirectTo,
}: {
  mode: "login" | "register";
  redirectTo?: string;
}) {
  const isLogin = mode === "login";
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/today";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = isLogin ? loginSchema.safeParse(raw) : registerSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your details.");
      return;
    }

    setPending(true);
    try {
      const result = isLogin
        ? await authClient.signIn.email({
            email: parsed.data.email,
            password: parsed.data.password,
          })
        : await authClient.signUp.email({
            name: (parsed.data as z.infer<typeof registerSchema>).name,
            email: parsed.data.email,
            password: parsed.data.password,
          });

      if (result.error) {
        setPending(false);
        setError(result.error.message || "Something went wrong. Please try again.");
        return;
      }

      // On success a session cookie is set (autoSignIn); go to the target.
      router.replace(target);
      router.refresh();
    } catch {
      // A network/transport failure rejects instead of returning an error object.
      // Never leave the button stuck on "Signing in..." with no feedback.
      setPending(false);
      setError("Could not reach the server. Please try again.");
    }
  }

  return (
    <div className="raised card-shadow relative overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-8">
      {/* Hairline accent along the top edge of the card. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <Brand />
        <div>
          <h1 className="text-headline-lg text-on-surface">
            {isLogin ? "Welcome back" : "Create the owner account"}
          </h1>
          <p className="mt-1.5 text-body-md text-on-surface-variant">
            {isLogin
              ? "Sign in to your execution system."
              : "This one-time setup creates the single owner of this GoHa."}
          </p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {isLogin ? null : (
          <Field label="Name">
            <Input name="name" autoComplete="name" placeholder="Maki" disabled={pending} />
          </Field>
        )}
        <Field label="Email">
          <Input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            disabled={pending}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            name="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder="Your password"
            required
            disabled={pending}
          />
        </Field>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full shadow-glow" loading={pending}>
          {isLogin ? "Sign in" : "Create owner account"}
        </Button>
      </form>

      {isLogin ? (
        <p className="mt-6 text-center text-body-sm text-on-surface-variant">
          First time setting up GoHa?{" "}
          <Link className="text-primary hover:underline" href="/register">
            Create the owner account
          </Link>
        </p>
      ) : (
        <p className="mt-6 text-center text-body-sm text-on-surface-variant">
          Already set up?{" "}
          <Link className="text-primary hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      )}
    </div>
  );
}
