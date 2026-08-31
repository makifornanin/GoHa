"use client";

import { Archive, ListChecks, Pencil, Repeat, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { LifeAreaWithCounts } from "@/db/repositories/life-areas";
import {
  LIFE_AREA_WEIGHT_MAX,
  resolveAreaColor,
} from "@/lib/life-areas";
import { cn } from "@/lib/utils";

import { AddMenu } from "@/components/shell/add-menu";

import { LifeAreaIcon } from "./icon";

/** Actions reveal on hover for pointer devices, stay visible on touch. */
const revealAction =
  "hit-44 hit-44-narrow flex size-7 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-all focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100";

function Rollup({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <Icon className="size-3.5 shrink-0 text-label-tertiary" aria-hidden />
      <span className="font-mono text-footnote tabular-nums text-label">{value}</span>
      <span className="truncate text-footnote text-label-secondary">{label}</span>
    </div>
  );
}

/**
 * A single life area, and the spine of the colour system: the area's colour is
 * what tints its goals, tasks and habits everywhere else in the app.
 *
 * The card carries real rollups now. It previously showed only a name, an
 * optional description and an importance dot row, which left the page two thirds
 * empty and said nothing about what the area actually holds.
 */
export function LifeAreaCard({
  area,
  onEdit,
  onArchive,
  pending,
}: {
  area: LifeAreaWithCounts;
  onEdit: (area: LifeAreaWithCounts) => void;
  onArchive: (area: LifeAreaWithCounts) => void;
  pending?: boolean;
}) {
  /*
   * A preset key or a custom hex, resolved to one answer.
   *
   * Preset colours keep their Tailwind classes so nothing about an existing
   * area changes. A custom colour has no class to apply, so those slots fall
   * back to an inline style built from the same `fill`.
   */
  const resolved = resolveAreaColor(area.color, area.id);
  /** Class when the colour is a preset, inline style when it is custom. */
  const paint = (className: string | null) =>
    resolved.kind === "preset"
      ? { className: className ?? undefined, style: undefined }
      : { className: undefined, style: { backgroundColor: resolved.fill } };
  const taskTotal = area.openTasks + area.completedTasks;
  const donePercent = taskTotal === 0 ? 0 : Math.round((area.completedTasks / taskTotal) * 100);
  const isEmpty = area.activeGoals + taskTotal + area.activeHabits === 0;

  return (
    <div
      data-testid="life-area-card"
      className={cn(
        // `h-full` so a grid row of cards shares one baseline: without it the
        // cards were top-aligned with ragged bottoms (133px next to 151px).
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1 transition-shadow hover:shadow-e2",
        pending && "pointer-events-none opacity-60",
      )}
    >
      {/* The area's colour, stated once and strongly, at the card's edge. */}
      <span className={cn("absolute inset-x-0 top-0 h-1", paint(resolved.dot).className)} style={paint(resolved.dot).style} aria-hidden />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", resolved.tile)}
            style={
              resolved.kind === "custom"
                ? { backgroundColor: `${resolved.fill}26`, color: resolved.fill }
                : undefined
            }
          >
            <LifeAreaIcon iconKey={area.icon} className="size-4" />
          </div>
          <h3 className="truncate text-headline text-label">{area.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/*
            Start something IN this area, with the area already chosen.

            A life area is the top of the chain, so the useful thing to do from
            one is to hang a goal off it. Before this, doing that meant leaving
            the page, opening the goals board, opening a form, and re-selecting
            the area you had just been looking at.
          */}
          <AddMenu
            context="life-area"
            lifeAreaId={area.id}
            variant="ghost"
            size="sm"
            iconOnly
            iconLabel={`Add something to ${area.name}`}
            className={cn(
              "[&_button]:size-7 [&_button]:min-h-0 [&_button]:rounded-full [&_button]:p-0",
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100",
            )}
          />
          <button
            type="button"
            onClick={() => onEdit(area)}
            aria-label={`Edit ${area.name}`}
            className={cn(revealAction, "hover:text-label")}
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onArchive(area)}
            aria-label={`Archive ${area.name}`}
            className={cn(revealAction, "hover:text-red")}
          >
            <Archive className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {area.description ? (
        <p className="relative mt-3 line-clamp-2 text-callout text-label-secondary">
          {area.description}
        </p>
      ) : null}

      {/* What this area actually holds. */}
      <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Rollup icon={Trophy} value={area.activeGoals} label="goals" />
        <Rollup icon={ListChecks} value={area.openTasks} label="open" />
        <Rollup icon={Repeat} value={area.activeHabits} label="habits" />
      </div>

      {taskTotal > 0 ? (
        <div className="relative mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-footnote text-label-secondary">
              {area.completedTasks} of {taskTotal} tasks done
            </span>
            <span className="font-mono text-footnote tabular-nums text-label-secondary">
              {donePercent}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill-tertiary">
            <div
              className={cn("h-full rounded-full transition-[width] duration-300", paint(resolved.dot).className)}
              style={{ ...paint(resolved.dot).style, width: `${donePercent}%` }}
            />
          </div>
        </div>
      ) : isEmpty ? (
        <p className="relative mt-3 text-footnote italic text-label-tertiary">
          Nothing linked to this area yet.
        </p>
      ) : null}

      <div className="relative mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="text-caption uppercase text-label-secondary">Importance</span>
        <div
          className="flex items-center gap-1.5"
          aria-label={`Importance ${area.weight} of ${LIFE_AREA_WEIGHT_MAX}`}
        >
          {Array.from({ length: LIFE_AREA_WEIGHT_MAX }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-2 rounded-full transition-colors",
                i < area.weight ? paint(resolved.dot).className : "bg-fill-tertiary",
              )}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  );
}
