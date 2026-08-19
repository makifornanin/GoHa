import type { ReactNode } from "react";

/** Standard page heading: title-2 with a callout subtitle (spec section 3). */
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
      <div>
        <h1 className="text-title-2 text-label">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-callout text-label-secondary">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex w-full items-center gap-2 [&>*]:flex-1 sm:w-auto sm:shrink-0 sm:[&>*]:flex-none">
          {action}
        </div>
      ) : null}
    </div>
  );
}
