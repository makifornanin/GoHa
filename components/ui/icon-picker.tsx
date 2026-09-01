"use client";

import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { lifeAreaIconMap } from "@/components/life-areas/icon";
import { COMMON_ICON_KEYS, ICON_GROUPS, type LifeAreaIconKey } from "@/lib/life-areas";
import { cn } from "@/lib/utils";

/**
 * Choosing an icon, without the catalog taking the form hostage.
 *
 * COLLAPSED BY DEFAULT: eight common icons and a "Show more icons". The full
 * library is forty-three glyphs in nine groups, and rendering all of it on sight
 * made the icon field the tallest thing in every form it appeared in, pushing
 * the name, the hours and the save button below the fold. Most categories are
 * answered by the eight; the rest are one press away.
 *
 * Expanded, it is grouped with a filter rather than one wall of glyphs. The
 * headings answer the question the user is actually asking ("what is this
 * about") rather than "which of these little pictures do I like", and the filter
 * matches the key and the group name, so typing "money" finds the wallet even
 * though the key is `wallet`.
 */
export function IconPicker({
  value,
  onChange,
  disabled,
  ariaLabel = "Icon",
}: {
  value: LifeAreaIconKey;
  onChange: (next: LifeAreaIconKey) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const fieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  /*
   * The current icon is always in the collapsed row.
   *
   * Picking "rocket" from the library and then collapsing would otherwise show
   * eight icons, none of them selected, while the entity plainly has one.
   */
  const quick = useMemo<readonly LifeAreaIconKey[]>(
    () => (COMMON_ICON_KEYS.includes(value) ? COMMON_ICON_KEYS : [value, ...COMMON_ICON_KEYS]),
    [value],
  );

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ICON_GROUPS.map((g) => ({ label: g.label, keys: [...g.keys] }));
    return ICON_GROUPS.map((group) => ({
      label: group.label,
      keys: group.keys.filter(
        (key) => key.includes(needle) || group.label.toLowerCase().includes(needle),
      ),
    })).filter((group) => group.keys.length > 0);
  }, [query]);

  function Swatch({ iconKey }: { iconKey: LifeAreaIconKey }) {
    const Icon = lifeAreaIconMap[iconKey];
    const selected = iconKey === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={iconKey}
        title={iconKey}
        disabled={disabled}
        onClick={() => onChange(iconKey)}
        className={cn(
          "hit-44 hit-44-narrow flex aspect-square cursor-pointer items-center justify-center rounded-lg transition-colors",
          "focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
          selected
            ? // Selection is a filled chip AND a ring, not colour alone, so it
              // survives a colour-blind reader and a high-contrast mode.
              "bg-blue-fill text-white ring-2 ring-blue-fill ring-offset-1 ring-offset-surface"
            : "text-label-secondary hover:bg-surface-hover hover:text-label",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-8 gap-1">
        {quick.map((key) => (
          <Swatch key={key} iconKey={key} />
        ))}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={`${fieldId}-library`}
        className="flex cursor-pointer items-center gap-1 self-start rounded-md text-footnote text-blue underline-offset-2 transition-colors hover:underline focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
      >
        {expanded ? (
          <>
            <ChevronUp className="size-3.5" aria-hidden />
            Show fewer icons
          </>
        ) : (
          <>
            <ChevronDown className="size-3.5" aria-hidden />
            Show more icons
          </>
        )}
      </button>

      {expanded ? (
        <div id={`${fieldId}-library`} className="flex flex-col gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-label-tertiary"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={disabled}
              placeholder="Search icons"
              aria-label="Search icons"
              // Same metrics as the other inputs, including the 16px that stops
              // iOS zooming the page when the field takes focus.
              className="h-11 w-full rounded-lg bg-fill-tertiary pl-8 pr-3 text-[16px] text-label placeholder:text-label-secondary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 sm:h-9 sm:text-body"
            />
          </div>

          {/* Bounded so the library cannot push the form's actions off screen,
              and scrolls inside itself instead of growing the modal. */}
          <div
            role="radiogroup"
            aria-label="All icons"
            className="max-h-52 overflow-y-auto rounded-lg border border-separator-opaque p-2"
          >
            {groups.length === 0 ? (
              <p className="px-1 py-6 text-center text-callout text-label-tertiary">
                No icons match “{query}”.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mb-2 last:mb-0">
                  <p className="px-1 pb-1 text-caption font-medium uppercase tracking-wide text-label-tertiary">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                    {group.keys.map((key) => (
                      <Swatch key={`${group.label}-${key}`} iconKey={key as LifeAreaIconKey} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
