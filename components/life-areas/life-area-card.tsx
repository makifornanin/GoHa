"use client";

import { Archive, Pencil } from "lucide-react";

import type { LifeArea } from "@/db";
import {
  LIFE_AREA_WEIGHT_MAX,
  lifeAreaColorConfig,
  toColorKey,
} from "@/lib/life-areas";
import { cn } from "@/lib/utils";

import { LifeAreaIcon } from "./icon";

/** Actions reveal on hover for pointer devices, stay visible on touch. */
const revealAction =
  "hit-44 hit-44-narrow flex size-7 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-all focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100";

/**
 * A single life area. It shows the area's own real data (icon, color, name,
 * description, importance). The per-area goal/task rollups and Life Score in the
 * static mock are derived from the Goals/Tasks/Progress phases and are
 * intentionally deferred until that data exists (CLAUDE.md section 9).
 */
export function LifeAreaCard({
  area,
  onEdit,
  onArchive,
  pending,
}: {
  area: LifeArea;
  onEdit: (area: LifeArea) => void;
  onArchive: (area: LifeArea) => void;
  pending?: boolean;
}) {
  const color = lifeAreaColorConfig[toColorKey(area.color)];

  return (
    <div
      data-testid="life-area-card"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1 transition-shadow hover:shadow-e2",
        pending && "pointer-events-none opacity-60",
      )}
    >

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", color.tile)}>
            <LifeAreaIcon iconKey={area.icon} className="size-4" />
          </div>
          <h3 className="truncate text-headline text-label">{area.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
        <p className="relative mt-3 line-clamp-3 text-callout text-label-secondary">
          {area.description}
        </p>
      ) : (
        <p className="relative mt-3 text-callout italic text-label-tertiary">No description yet.</p>
      )}

      <div className="relative mt-auto flex items-center justify-between gap-3 pt-5">
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
                i < area.weight ? color.dot : "bg-gray-4",
              )}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  );
}
