"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { spring } from "@/lib/motion";
import { useMounted } from "@/lib/use-mounted";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-subhead text-label-secondary">{label}</span>
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
 * A cinematic screen per spec section 10: one message, generous negative
 * space, a single blue primary action, a slow `smooth` entrance. Restrained:
 * no card chrome, no ambient effects; content sits directly on the canvas.
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
  const mounted = useMounted();
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.smooth, duration: 0.5 }}
    >
      <div className="mb-10 flex flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-blue text-white">
          <span className="text-title-3">G</span>
        </div>
        <div>
          <h1 className="text-large-title text-label">
            {isLogin ? "Welcome back" : "Set up GoHa"}
          </h1>
          <p className="mt-2 text-body text-label-secondary">
            {isLogin
              ? "Sign in to your execution system."
              : "This one-time setup creates the single owner of this GoHa."}
          </p>
        </div>
      </div>

      {/*
        `method="post"` matters even though submission is handled in JS. A form
        with no method defaults to GET, so a submit that happens BEFORE this
        component hydrates (or if its script fails to load) navigates to
        `/login?email=...&password=...`, writing the password into browser
        history, the Referer header, and any proxy log in between. Observed in
        testing during a slow first compile. POST keeps credentials in the body;
        the button below stays disabled until hydration so it should not happen
        at all.
      */}
      <form className="space-y-4" method="post" onSubmit={onSubmit} noValidate>
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
            className="rounded-lg bg-red/12 px-3 py-2 text-callout text-red"
          >
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="mt-2 w-full"
          // Until hydration there is no submit handler, so a click would do the
          // wrong thing rather than nothing.
          loading={pending || !mounted}
        >
          {isLogin ? "Sign in" : "Create owner account"}
        </Button>
      </form>

      <p className="mt-8 text-center text-callout text-label-secondary">
        {isLogin ? (
          <>
            First time setting up GoHa?{" "}
            <Link className="font-medium text-blue hover:underline" href="/register">
              Create the owner account
            </Link>
          </>
        ) : (
          <>
            Already set up?{" "}
            <Link className="font-medium text-blue hover:underline" href="/login">
              Sign in
            </Link>
          </>
        )}
      </p>
    </motion.div>
  );
}
