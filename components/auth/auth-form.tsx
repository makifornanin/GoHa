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
import { safeRedirectPath } from "@/lib/redirect";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

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
  canBootstrap = true,
  inviteCode,
  inviteRequired = false,
  inviteError,
  lockedEmail,
}: {
  mode: "login" | "register";
  redirectTo?: string;
  /**
   * Whether an account can still be created without an invitation. False once
   * the first account exists, so the sign-in screen stops offering a route that
   * always fails.
   */
  canBootstrap?: boolean;
  /** A validated invitation, carried to the server with the sign-up. */
  inviteCode?: string;
  /** True when this GoHa already has accounts and no usable invitation came. */
  inviteRequired?: boolean;
  /** Why the invitation was refused, in words meant for the person reading. */
  inviteError?: string;
  /** Set when the invitation names one address; the field is filled and held. */
  lockedEmail?: string | null;
}) {
  const isLogin = mode === "login";
  const router = useRouter();
  const mounted = useMounted();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  // Shared with the server component. A startsWith("/") test accepted
  // //attacker.example, which the browser resolves off-site (audit R-09).
  const target = safeRedirectPath(redirectTo);

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
        : await authClient.signUp.email(
            {
              name: (parsed.data as z.infer<typeof registerSchema>).name,
              email: parsed.data.email,
              password: parsed.data.password,
            },
            // The invitation travels in a header, not the body: Better Auth
            // validates the body against its own shape, and the gate that reads
            // this sits in front of it.
            inviteCode ? { headers: { "x-goha-invite": inviteCode } } : undefined,
          );

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
        {/* The same wordmark as the shell, at display size. The blue tile that
            used to sit here was the second copy of a mark the app no longer
            has; the sign-in screen is where the name should be at its most
            deliberate, not where a placeholder glyph lives. */}
        <p className="flex items-baseline text-[34px] leading-[40px] tracking-[-0.04em]">
          <span className="font-semibold text-label">Go</span>
          <span className="font-normal text-label-secondary">Ha</span>
          <span
            aria-hidden
            className="ml-1.5 size-2 shrink-0 self-center rounded-full bg-blue"
          />
        </p>
        <div>
          <h1 className="text-large-title text-label">
            {isLogin ? "Welcome back" : inviteRequired ? "Invitation needed" : "Create your account"}
          </h1>
          <p className="mt-2 text-body text-label-secondary">
            {isLogin
              ? "Sign in to your execution system."
              : inviteRequired
                ? "This GoHa is invite only."
                : canBootstrap
                  ? "This first account becomes the owner of this GoHa."
                  : "You have been invited. Your goals, habits and history are yours alone."}
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
      {inviteRequired ? (
        <div className="space-y-4">
          <p role="alert" className="rounded-lg bg-fill-quaternary px-4 py-3 text-callout text-label-secondary">
            {inviteError ?? "An invitation is needed to create an account here."}
          </p>
          <Link
            href="/login"
            className="block text-center text-callout font-medium text-blue hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
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
            defaultValue={lockedEmail ?? undefined}
            // A locked address is part of the invitation, so it is submitted
            // even though the field cannot be edited.
            readOnly={Boolean(lockedEmail)}
          />
          {lockedEmail ? (
            <p className="mt-1 text-footnote text-label-tertiary">
              This invitation is for {lockedEmail}.
            </p>
          ) : null}
        </Field>
        <Field label="Password">
          <Input
            type="password"
            name="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={isLogin ? "Your password" : "At least 8 characters"}
            required
            disabled={pending}
            onChange={isLogin ? undefined : (event) => setPassword(event.target.value)}
          />
          {isLogin ? null : <PasswordMeter value={password} />}
        </Field>

        {/* Under the password, where someone looks after it has been refused. */}
        {isLogin ? (
          <p className="-mt-2 text-right">
            <Link
              className="text-footnote font-medium text-blue hover:underline"
              href="/forgot-password"
            >
              Forgot password?
            </Link>
          </p>
        ) : null}

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
          {isLogin ? "Sign in" : canBootstrap ? "Create owner account" : "Create my account"}
        </Button>
      </form>
      )}

      {/* Nothing at all once the owner exists and we are on the sign-in
          screen: there is no second account to create, so the only honest
          footer is no footer. */}
      {(isLogin && !canBootstrap) || inviteRequired ? null : (
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
      )}
    </motion.div>
  );
}

/**
 * How strong the password is, said plainly.
 *
 * The server enforces 8 characters and nothing else, which is a floor rather
 * than advice. This is the advice: it reacts as you type, names what would
 * improve it, and never blocks submission. A meter that refuses a password the
 * server would accept teaches people to distrust the form.
 *
 * Length is weighted heaviest because it is what actually matters, and the
 * common-password check catches the handful that a strength formula rates well
 * and an attacker tries first.
 */
const COMMON = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "qwertyui",
  "iloveyou",
  "letmein1",
  "admin123",
]);

function scorePassword(value: string): { score: 0 | 1 | 2 | 3; label: string; hint: string } {
  if (value.length === 0) return { score: 0, label: "", hint: "" };
  if (COMMON.has(value.toLowerCase())) {
    return { score: 0, label: "Too common", hint: "This is one of the first passwords anyone tries." };
  }
  if (value.length < 8) {
    return { score: 0, label: "Too short", hint: `${8 - value.length} more character(s) needed.` };
  }

  let score = 0;
  if (value.length >= 12) score += 1;
  if (value.length >= 16) score += 1;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (variety >= 3) score += 1;

  const capped = Math.min(3, score) as 0 | 1 | 2 | 3;
  return {
    score: capped,
    label: ["Weak", "Fair", "Good", "Strong"][capped],
    hint:
      capped >= 3
        ? ""
        : value.length < 12
          ? "Longer beats more complicated: a few words together works well."
          : "Mixing in a number or symbol would help.",
  };
}

function PasswordMeter({ value }: { value: string }) {
  const { score, label, hint } = scorePassword(value);
  if (value.length === 0) return null;

  const colors = ["bg-red", "bg-orange", "bg-yellow", "bg-green"];
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((step) => (
          <span
            key={step}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              step <= score ? colors[score] : "bg-fill-tertiary",
            )}
          />
        ))}
      </div>
      <p className="text-footnote text-label-tertiary" aria-live="polite">
        <span className="text-label-secondary">{label}</span>
        {hint ? ` — ${hint}` : ""}
      </p>
    </div>
  );
}
