import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-headline-lg-mobile text-on-surface md:text-headline-lg">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-3">{action}</div>
      ) : null}
    </div>
  );
}
