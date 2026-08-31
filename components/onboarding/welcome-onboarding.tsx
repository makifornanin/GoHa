"use client";

import { BellRing, CalendarCheck, Hourglass, Repeat, Sparkles, Target, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { completeOnboardingAction } from "@/app/(app)/onboarding-actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

import { HierarchyDiagram } from "./hierarchy-diagram";

/**
 * First-login welcome: five short screens that teach the MODEL, not the menu.
 *
 * The previous version listed features ("plan around what matters", "focus
 * without drifting", "get a nudge"), which is what GoHa does but not how it
 * works. Somebody who read all three still did not know that a goal is meant to
 * break into subgoals, that subgoals hold to-dos, or why any of that is better
 * than a list. That is the one idea the whole product rests on, so it now gets
 * two screens of its own and a diagram rather than a sentence.
 *
 * Shown when `user_settings.onboarding_completed_at` is null, which is a SERVER
 * value: it survives a logout, another browser and another device, and no
 * amount of local storage can resurrect it once set. The only client state here
 * is which screen is on show.
 *
 * The last screen hands off to the real notification setup in Settings rather
 * than reproducing it. That flow already knows how to detect the browser, ask
 * for permission and pair a phone, and a second copy would be a second thing to
 * keep correct.
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
        <div className="flex flex-col gap-4">
          <p className="text-callout leading-relaxed text-label-secondary">
            GoHa turns what matters to you into things you can actually work on today. The whole
            idea is one chain:
          </p>
          {/*
            The shape, before any example is hung on it.

            Every step shares one grid cell so the modal never resizes, which
            leaves screen one with room the shorter copy does not use. More
            prose would make a newcomer's first sight of GoHa a wall of text;
            the chain itself is the one idea the product rests on, and the next
            two screens are about putting a worked example onto exactly this.
          */}
          <HierarchyDiagram
            compact
            rows={[
              { level: "Life Area" },
              { level: "Goal" },
              { level: "Subgoal" },
              { level: "To-do" },
            ]}
          />
          <p className="text-footnote text-label-tertiary">
            Four screens, then you are in.
          </p>
        </div>
      ),
    },
    {
      key: "matters",
      icon: <Target className="size-5" />,
      title: "Start with what matters",
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-callout leading-relaxed text-label-secondary">
            A <strong className="font-medium text-label">life area</strong> is a standing part of
            your life. A <strong className="font-medium text-label">goal</strong> is an outcome you
            want in one of them.
          </p>
          {/* The example carries the teaching. "A goal is a meaningful outcome"
              explains nothing; "Career, then Find a new job" explains it all. */}
          <HierarchyDiagram
            rows={[
              { level: "Life Area", example: "Career" },
              { level: "Goal", example: "Find a new job" },
            ]}
          />
          <p className="text-footnote text-label-tertiary">
            Goals finish. Life areas do not.
          </p>
        </div>
      ),
    },
    {
      key: "breakdown",
      icon: <Target className="size-5" />,
      title: "Break the goal down",
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-callout leading-relaxed text-label-secondary">
            A goal is too big to do. Split it into{" "}
            <strong className="font-medium text-label">subgoals</strong> you could finish, then into{" "}
            <strong className="font-medium text-label">to-dos</strong> you could start this morning.
          </p>
          <HierarchyDiagram
            rows={[
              { level: "Goal", example: "Find a new job", muted: true },
              { level: "Subgoal", example: "Finish my resume" },
              { level: "To-do", example: "Rewrite the experience section" },
            ]}
          />
          <p className="text-footnote text-label-tertiary">
            Finishing a to-do moves the subgoal, and the goal, on its own.
          </p>
        </div>
      ),
    },
    {
      key: "day",
      icon: <Hourglass className="size-5" />,
      title: "Plan your day",
      body: (
        <div className="flex flex-col gap-4">
          <p className="text-callout leading-relaxed text-label-secondary">
            You have 24 hours, and most of them are already spoken for. GoHa helps you see what
            genuinely fits.
          </p>
          <ul className="flex flex-col gap-4">
            <Bullet icon={<Hourglass className="size-4" />} title="Day Planner">
              Split the day into sleep, work and the rest, then pick what fits the time you actually
              have left.
            </Bullet>
            <Bullet icon={<CalendarCheck className="size-4" />} title="Today">
              What you chose, and nothing else.
            </Bullet>
            <Bullet icon={<Timer className="size-4" />} title="Focus and Habits">
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3" aria-hidden />
              </span>{" "}
              A timer for one to-do at a time, and the routines that carry the goals nobody finishes
              in a day.
            </Bullet>
          </ul>
        </div>
      ),
    },
    {
      key: "notifications",
      icon: <BellRing className="size-5" />,
      title: "Stay on track",
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-callout leading-relaxed text-label-secondary">
            GoHa can send a few reminders to your phone. All of them are off until you turn them on.
          </p>
          <ul className="flex flex-col gap-2 text-callout text-label-secondary">
            {[
              ["Morning Brief", "What today looks like, before it starts."],
              ["Evening Summary", "What actually happened."],
              ["Smart Task Reminders", "An occasional nudge about something still open."],
            ].map(([label, description]) => (
              <li key={label} className="flex gap-2.5">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="font-medium text-label">{label}</span>
                  {" — "}
                  {description}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-footnote text-label-tertiary">
            You can set this up any time from Settings.
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
        {/*
          All steps occupy ONE grid cell, and only the active one is visible.

          The cell is therefore as tall as the tallest step, so the shell stops
          resizing between them: the progress bar and the buttons stay exactly
          where they were when you press Continue. A fixed min-height was a
          guess that fitted one step and was overshot by the others, which is
          what made the modal jump.

          Height comes from the content rather than from a number, so a narrow
          screen that wraps the text grows the cell instead of clipping it.
          Inactive steps are hidden from assistive tech and cannot be tabbed
          into, so only the visible step is reachable.
        */}
        <div className="grid">
          {steps.map((entry, position) => (
            <div
              key={entry.key}
              aria-hidden={position !== index}
              inert={position !== index ? true : undefined}
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-200",
                position === index ? "opacity-100" : "pointer-events-none invisible opacity-0",
              )}
            >
              {entry.body}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {/* Progress reads as position, not decoration, so it is announced too. */}
          <div
            className="flex items-center gap-1.5"
            role="status"
            aria-label={`Step ${index + 1} of ${steps.length}`}
          >
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
                  Enable notifications
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
