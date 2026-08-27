"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import {
  COLOR_PRESETS,
  normalizeHex,
  readableForeground,
  resolveAreaColor,
} from "@/lib/life-areas";
import { cn } from "@/lib/utils";

/**
 * Choosing a colour for an entity.
 *
 * One picker, shared, rather than a swatch row reimplemented per form. It reads
 * and writes the SAME `color` field that already exists: one of the six legacy
 * keys, or a `#rrggbb` value. That is why adding custom colours needed no
 * migration, and why an area saved last month still renders unchanged.
 *
 * This is for entity colours only. It has nothing to do with GoHa's own blue
 * accent, which stays where it is.
 */
export function ColorPicker({
  value,
  onChange,
  entityId,
  disabled,
  ariaLabel = "Colour",
}: {
  value: string | null;
  onChange: (next: string) => void;
  /** Used only to resolve the stable fallback colour when nothing is saved. */
  entityId: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const resolved = resolveAreaColor(value, entityId);
  const [draft, setDraft] = useState(() => (resolved.kind === "custom" ? resolved.fill : ""));
  const [error, setError] = useState<string | null>(null);

  function commitCustom(raw: string) {
    const normalized = normalizeHex(raw);
    if (!normalized) {
      // Rejected, never guessed at: a typo becomes a visible message rather
      // than a silently wrong colour.
      setError("Enter a colour like #4a7ab5.");
      return;
    }
    setError(null);
    setDraft(normalized);
    onChange(normalized);
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((preset) => {
          const selected = resolved.fill.toLowerCase() === preset.hex.toLowerCase();
          return (
            <button
              key={preset.hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.label}
              title={preset.label}
              disabled={disabled}
              onClick={() => {
                setError(null);
                onChange(preset.hex);
              }}
              style={{ backgroundColor: preset.hex }}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-transform",
                "focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
                selected
                  ? "ring-2 ring-label ring-offset-2 ring-offset-surface"
                  : "hover:scale-110",
              )}
            >
              {/* A tick as well as a ring: selection must not be carried by
                  colour alone in a control whose whole subject is colour. */}
              {selected ? (
                <Check
                  className="size-4"
                  style={{ color: readableForeground(preset.hex) }}
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="color-custom" className="text-footnote text-label-secondary">
          Custom colour
        </label>
        <div className="flex items-center gap-2">
          {/* The native swatch is the right control here: it is the one input
              every platform already gives a good picker for, and it cannot
              produce an invalid value. */}
          <input
            id="color-custom-swatch"
            type="color"
            aria-label="Pick a custom colour"
            value={normalizeHex(draft) ?? resolved.fill}
            disabled={disabled}
            onChange={(e) => {
              setError(null);
              setDraft(e.target.value);
              onChange(e.target.value);
            }}
            className="size-11 shrink-0 cursor-pointer rounded-lg border border-separator-opaque bg-transparent p-1 sm:size-8"
          />
          <input
            id="color-custom"
            type="text"
            inputMode="text"
            spellCheck={false}
            value={draft}
            disabled={disabled}
            placeholder="#4a7ab5"
            aria-label="Custom colour hex value"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "color-custom-error" : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => e.target.value.trim() && commitCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCustom((e.target as HTMLInputElement).value);
              }
            }}
            className="h-11 w-full rounded-lg bg-fill-tertiary px-3 font-mono text-[16px] text-label placeholder:text-label-secondary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 sm:h-8 sm:px-2.5 sm:text-body"
          />
        </div>
        {error ? (
          <p id="color-custom-error" role="alert" className="text-footnote text-red">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
