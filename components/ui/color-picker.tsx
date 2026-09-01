"use client";

import { Check, Plus, X } from "lucide-react";
import { useId, useState } from "react";

import {
  COLOR_PRESETS,
  RECOMMENDED_COLORS,
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
 * keys, or a `#rrggbb` value. That is why custom colours needed no migration,
 * and why an area saved last month still renders unchanged.
 *
 * COMPACT BY DEFAULT. Sixteen swatches and a hex field is more colour-choosing
 * apparatus than a form needs on sight, and in the planner's category editor it
 * pushed the actual settings below the fold. Six recommended colours and a "+"
 * answer almost every case in one tap; the full palette and the custom control
 * are one press away and take the space only when asked for.
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
  const fieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(() => (resolved.kind === "custom" ? resolved.fill : ""));
  const [error, setError] = useState<string | null>(null);

  const isSelected = (hex: string) => resolved.fill.toLowerCase() === hex.toLowerCase();

  /*
   * The current colour is always visible in the collapsed row.
   *
   * A custom colour, or a preset that is not one of the six, would otherwise
   * leave the row showing no selection at all while the entity plainly has one,
   * which reads as "nothing chosen" rather than "chosen, just not from here".
   */
  const inRow = RECOMMENDED_COLORS.some((preset) => isSelected(preset.hex));
  const swatches = inRow
    ? RECOMMENDED_COLORS
    : [{ label: "Current colour", hex: resolved.fill }, ...RECOMMENDED_COLORS];

  function choose(hex: string) {
    setError(null);
    onChange(hex);
  }

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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap items-center gap-2">
          {swatches.map((preset) => {
            const selected = isSelected(preset.hex);
            return (
              <button
                key={preset.hex}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={preset.label}
                title={preset.label}
                disabled={disabled}
                onClick={() => choose(preset.hex)}
                style={{ backgroundColor: preset.hex }}
                className={cn(
                  "hit-44 hit-44-narrow flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform",
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

        <button
          type="button"
          disabled={disabled}
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={`${fieldId}-more`}
          aria-label={expanded ? "Fewer colours" : "More colours and custom colour"}
          title={expanded ? "Fewer colours" : "More colours"}
          className="hit-44 hit-44-narrow flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-separator-opaque text-label-secondary transition-colors hover:border-label-tertiary hover:text-label focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
        >
          {expanded ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        </button>
      </div>

      {expanded ? (
        <div
          id={`${fieldId}-more`}
          className="flex flex-col gap-3 rounded-lg border border-separator-opaque p-3"
        >
          <div>
            <p className="mb-1.5 text-caption uppercase tracking-wide text-label-tertiary">
              All colours
            </p>
            <div role="radiogroup" aria-label="All colours" className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => {
                const selected = isSelected(preset.hex);
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={preset.label}
                    title={preset.label}
                    disabled={disabled}
                    onClick={() => choose(preset.hex)}
                    style={{ backgroundColor: preset.hex }}
                    className={cn(
                      "hit-44 hit-44-narrow flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform",
                      "focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
                      selected
                        ? "ring-2 ring-label ring-offset-2 ring-offset-surface"
                        : "hover:scale-110",
                    )}
                  >
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
          </div>

          <div className="flex flex-col gap-1.5 border-t border-separator pt-3">
            <label
              htmlFor={`${fieldId}-hex`}
              className="text-caption uppercase tracking-wide text-label-tertiary"
            >
              Custom colour
            </label>
            <div className="flex items-center gap-2">
              {/* The native swatch is the primary control: it is the one input
                  every platform already gives a good picker for, and it cannot
                  produce an invalid value. The hex field beside it is for people
                  who already know the value they want. */}
              <input
                id={`${fieldId}-swatch`}
                type="color"
                aria-label="Pick a custom colour"
                value={normalizeHex(draft) ?? resolved.fill}
                disabled={disabled}
                onChange={(e) => {
                  setError(null);
                  setDraft(e.target.value);
                  onChange(e.target.value);
                }}
                className="size-11 shrink-0 cursor-pointer rounded-lg border border-separator-opaque bg-transparent p-1 sm:size-9"
              />
              <input
                id={`${fieldId}-hex`}
                type="text"
                inputMode="text"
                spellCheck={false}
                value={draft}
                disabled={disabled}
                placeholder="#4a7ab5"
                aria-label="Custom colour hex value"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${fieldId}-error` : undefined}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => e.target.value.trim() && commitCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitCustom((e.target as HTMLInputElement).value);
                  }
                }}
                className="h-11 w-full rounded-lg bg-fill-tertiary px-3 font-mono text-[16px] text-label placeholder:text-label-secondary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 sm:h-9 sm:px-2.5 sm:text-body"
              />
            </div>
            {error ? (
              <p id={`${fieldId}-error`} role="alert" className="text-footnote text-red">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
