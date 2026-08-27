"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { lifeAreaIconMap } from "@/components/life-areas/icon";
import { ICON_GROUPS, type LifeAreaIconKey } from "@/lib/life-areas";
import { cn } from "@/lib/utils";

/**
 * Choosing an icon, from a catalog that is now too long to scan flat.
 *
 * Grouped with a filter rather than one wall of glyphs. Forty icons in an
 * undifferentiated grid is slower to search than a handful of headings, and the
 * headings answer the question the user is actually asking ("what is this area
 * about") rather than "which of these little pictures do I like".
 *
 * The filter matches the key and the group name, so typing "money" finds the
 * wallet even though the key is `wallet`, and typing "code" finds it directly.
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
  const [query, setQuery] = useState("");

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

  return (
    <div className="flex flex-col gap-2">
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
          // Same metrics as the other inputs, including the 16px that stops iOS
          // zooming the page when the field takes focus.
          className="h-11 w-full rounded-lg bg-fill-tertiary pl-8 pr-3 text-[16px] text-label placeholder:text-label-tertiary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 sm:h-8 sm:text-body"
        />
      </div>

      {/* Bounded so a long catalog cannot push the form's actions off screen. */}
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="max-h-56 overflow-y-auto rounded-lg border border-separator-opaque p-2"
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
                {group.keys.map((key) => {
                  const Icon = lifeAreaIconMap[key as LifeAreaIconKey];
                  const selected = key === value;
                  return (
                    <button
                      key={`${group.label}-${key}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={key}
                      disabled={disabled}
                      onClick={() => onChange(key as LifeAreaIconKey)}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-lg transition-colors",
                        selected
                          ? // Selection is a filled chip AND a ring, not colour
                            // alone, so it survives a colour-blind reader and a
                            // high-contrast mode.
                            "bg-blue text-white ring-2 ring-blue ring-offset-1 ring-offset-surface"
                          : "text-label-secondary hover:bg-surface-hover hover:text-label",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
