"use client";

import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type TableRow = { key: string; cells: string[]; emphasis?: boolean };

/**
 * The tabular equivalent of a chart (audit R-18).
 *
 * Every chart on Progress is a picture: bar heights and colour intensity carry
 * the whole message, which is nothing at all to a screen reader, and none of it
 * was reachable from the keyboard. This is the same numbers as a real table,
 * collapsed by default so the visual reading stays primary.
 *
 * `<details>` rather than a scripted disclosure: it opens with the keyboard,
 * announces its own expanded state, and works before hydration.
 */
export function ChartDataTable({
  caption,
  columns,
  rows,
  label = "Show the numbers",
  className,
}: {
  caption: string;
  columns: string[];
  rows: TableRow[];
  label?: string;
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <details className={cn("group mt-3", className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg text-footnote text-label-secondary transition-colors hover:text-label focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-3.5 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {label}
      </summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-separator-opaque">
        <table className="w-full border-collapse text-footnote tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    "border-b border-separator px-3 py-2 font-medium text-label-secondary",
                    index === 0 ? "text-left" : "text-right",
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={cn(row.emphasis && "bg-fill-quaternary")}>
                {row.cells.map((cell, index) =>
                  index === 0 ? (
                    <th
                      key={index}
                      scope="row"
                      className="px-3 py-1.5 text-left font-normal text-label-secondary"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td key={index} className="px-3 py-1.5 text-right text-label">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
