import Link from "next/link";
import { Compass } from "lucide-react";

import { Brand } from "@/components/shell/brand";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Page not found" };

/**
 * The 404.
 *
 * This lives at the ROOT, outside the `(app)` group, so it renders without the
 * sidebar or the bottom bar. That is why it carries its own way out: the
 * default Next.js page left the reader on a bare white screen with no
 * navigation at all, and the browser's back button as the only exit.
 *
 * Where "out" leads depends on who is asking, so the session is read here
 * rather than guessed. Someone signed in is offered Today; someone who is not
 * is offered the sign-in page, because Today would only bounce them there.
 *
 * A signed-OUT request for an unknown URL never reaches this page: the proxy
 * redirects everything it does not recognise as public to /login, and it cannot
 * tell an unknown route from a protected one without a route manifest. Guessing
 * wrong there would serve a protected page, so the redirect stays. See
 * docs/BUILD_PLAN.md for the tradeoff.
 */
export default async function NotFound() {
  const user = await getCurrentUser();
  const href = user ? "/today" : "/login";
  const label = user ? "Back to Today" : "Go to sign in";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-16">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-8">
          <Brand />
        </div>

        <span
          className="mb-5 flex size-12 items-center justify-center rounded-full bg-surface-secondary text-label-secondary"
          aria-hidden
        >
          <Compass className="size-6" />
        </span>

        <h1 className="text-title-2 text-label">Page not found</h1>
        <p className="mt-2 text-callout leading-relaxed text-label-secondary">
          That address does not match anything in GoHa. It may have been renamed, or the link
          might have a typo in it.
        </p>

        <Link
          href={href}
          className="touch-target mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-blue-fill px-5 text-[15px]/[20px] font-medium text-white transition-[filter] hover:brightness-[1.08] focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 sm:h-10"
        >
          {label}
        </Link>
      </div>
    </main>
  );
}
