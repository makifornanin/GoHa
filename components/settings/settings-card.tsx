import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one settings card shell.
 *
 * This markup had been copied into five separate files, which is why the page
 * drifted: each copy carried its own padding, its own header gap, and its own
 * idea of how much space sits under the title. Sharing it is what makes the
 * spacing consistent, rather than five files agreeing by luck.
 */
export function SettingsCard({
  icon,
  title,
  description,
  actions,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  /** Optional control aligned with the title, for cards with one primary action. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-separator-opaque bg-surface p-5 shadow-e1 lg:p-6",
        className,
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-label-secondary"
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-headline text-label">{title}</h3>
            {description ? (
              <p className="mt-1 text-callout leading-snug text-label-secondary">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A titled group of cards.
 *
 * Settings was ten cards in one flat grid, so everything read as equally
 * important and finding anything meant scanning all of it. Grouping gives the
 * page a shape: account, then appearance, then notifications, then the things
 * you touch once a year.
 */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="px-1">
        <h2 className="text-caption font-semibold uppercase tracking-wide text-label-secondary">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-footnote text-label-secondary">{description}</p>
        ) : null}
      </div>
      {/* `items-start` keeps a short card from stretching to match a tall
          neighbour, which is what made the columns look ragged. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}
