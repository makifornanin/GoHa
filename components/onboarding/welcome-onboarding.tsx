"use client";

import { BellRing, CalendarCheck, Sparkles, Target, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { completeOnboardingAction } from "@/app/(app)/onboarding-actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * First-login welcome, three steps and no more.
 *
 * Shown when `user_settings.onboarding_completed_at` is null, which is a server
 * value: it survives a logout, another browser and another device, and no
 * amount of local storage can resurrect it once it is set. The client state
 * here is only which step is on screen.
 *
 * The last step hands off to the real notification setup in Settings rather
 * than reproducing it. That flow already knows how to detect the browser, ask
 * for permission and pair a phone, and a second copy of it would be a second
 * thing to keep correct.
 */

type Step = {
  key: string;
  icon: ReactNode;
  title: string;
  body: ReactNode;
};

function Bullet({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-fill-quaternary text-blue"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-subhead text-label">{title}</span>
        <span className="block text-callout leading-snug text-label-secondary">{children}</span>
      </span>
    </li>
  );
}

export function WelcomeOnboarding({ name }: { name: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();

  const firstName = name?.trim().split(/\s+/)[0] ?? null;

  const steps: Step[] = [
    {
      key: "welcome",
      icon: <Sparkles className="size-5" />,
      title: firstName ? `Welcome to GoHa, ${firstName}` : "Welcome to GoHa",
      body: (
        <p className="text-callout leading-relaxed text-label-secondary">
          GoHa connects your goals to what you actually do today, so planning, focusing and
          finishing all live in one place instead of three.
        </p>
      ),
    },
    {
      key: "how",
      icon: <CalendarCheck className="size-5" />,
      title: "How GoHa helps",
      body: (
        <ul className="flex flex-col gap-4">
          <Bullet icon={<Target className="size-4" />} title="Plan around what matters">
            Break a goal into tasks and habits, then see only what belongs to today.
          </Bullet>
          <Bullet icon={<Timer className="size-4" />} title="Focus without drifting">
            Start a focus session on one task and get an honest record of where the time went.
          </Bullet>
          <Bullet icon={<BellRing className="size-4" />} title="Get a nudge, not a stream">
            A brief in the morning, a summary in the evening, and a reminder when a deadline is
            close.
          </Bullet>
        </ul>
      ),
    },
    {
      key: "notifications",
      icon: <BellRing className="size-5" />,
      title: "Get reminders on your phone",
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-callout leading-relaxed text-label-secondary">
            GoHa can send your morning brief and deadline reminders straight to your phone. It
            takes a minute to set up:
          </p>
          <ol className="flex flex-col gap-2 text-callout text-label-secondary">
            {[
              "Open GoHa on your phone.",
              "Add it to your Home Screen when your phone asks.",
              "Open it from the Home Screen and turn notifications on.",
            ].map((line, step) => (
              <li key={line} className="flex gap-2.5">
                <span
                  className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-footnote font-medium text-label-secondary"
                  aria-hidden
                >
                  {step + 1}
                </span>
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ol>
          <p className="text-footnote text-label-tertiary">
            You can do this any time from Settings. Nothing is sent until you choose which
            reminders you want.
          </p>
        </div>
      ),
    },
  ];

  const step = steps[index];
  const isLast = index === steps.length - 1;

  /** Persist first, then act, so a failed write never silently loses the state. */
  function finish(then?: () => void) {
    startTransition(async () => {
      await completeOnboardingAction();
      setOpen(false);
      then?.();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      // The close affordance means the same thing as "Maybe later": seen, done,
      // do not ask again. Treating a dismissal as "not seen" is what turns a
      // welcome into a nag.
      onClose={() => finish()}
      title={step.title}
      className="sm:max-w-lg"
    >
      <div className="flex flex-col gap-6 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
        <div className="min-h-[9rem]">{step.body}</div>

        <div className="flex flex-col gap-4">
          {/* Progress reads as position, not decoration, so it is announced too. */}
          <div className="flex items-center gap-1.5" role="status" aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((entry, position) => (
              <span
                key={entry.key}
                aria-hidden
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-200",
                  position <= index ? "bg-blue" : "bg-fill-tertiary",
                )}
              />
            ))}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {isLast ? (
              <>
                <Button variant="ghost" onClick={() => finish()} disabled={pending}>
                  Maybe later
                </Button>
                <Button
                  onClick={() => finish(() => router.push("/settings#notifications"))}
                  loading={pending}
                  disabled={pending}
                >
                  Set up notifications
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => finish()} disabled={pending}>
                  Skip
                </Button>
                <Button onClick={() => setIndex((value) => value + 1)} disabled={pending}>
                  Continue
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
