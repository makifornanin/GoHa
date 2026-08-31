import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Crumb = {
  label: string;
  /** Omitted for the current page, which is text rather than a link. */
  href?: string;
  /** A small leading mark, e.g. a life area's coloured dot. */
  icon?: ReactNode;
};

/**
 * The chain that says where you are: Career > Find a new job > Finish resume.
 *
 * Used ONLY on detail pages, where orientation is a real question. GoHa's
 * hierarchy is four levels deep and the middle two live in the same table, so
 * without this a subgoal page is indistinguishable from a goal page. On a list
 * screen there is nothing to orient against and a breadcrumb is just a second
 * page title, which is why this is not in the shell.
 *
 * The last crumb carries `aria-current="page"` and is never a link: linking the
 * page you are already on is a dead control that also reads as one to a screen
 * reader.
 *
 * On a narrow screen the row scrolls sideways rather than wrapping into a
 * ragged block, and each label truncates instead of pushing the trail off the
 * edge. Long goal titles are the normal case, not the exception.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 overflow-x-auto text-footnote text-label-secondary [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 shrink-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="size-3 shrink-0 text-label-quaternary" aria-hidden />
              ) : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="hit-44 hit-44-narrow inline-flex max-w-40 items-center gap-1.5 truncate rounded-sm px-0.5 transition-colors hover:text-label focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn(
                    "inline-flex max-w-52 items-center gap-1.5 truncate px-0.5",
                    last && "font-medium text-label",
                  )}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
