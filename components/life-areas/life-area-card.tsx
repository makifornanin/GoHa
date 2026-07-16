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
  "flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100";

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
        "group raised card-shadow card-elevated relative flex flex-col overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-6",
        pending && "pointer-events-none opacity-60",
      )}
    >
      <div className={cn("absolute right-0 top-0 -z-0 size-24 rounded-bl-full", color.blob)} aria-hidden />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", color.tile)}>
            <LifeAreaIcon iconKey={area.icon} className="size-5" />
          </div>
          <h3 className="truncate text-headline-md text-on-surface">{area.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(area)}
            aria-label={`Edit ${area.name}`}
            className={cn(revealAction, "hover:bg-surface-container-high hover:text-on-surface")}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onArchive(area)}
            aria-label={`Archive ${area.name}`}
            className={cn(revealAction, "hover:bg-error/10 hover:text-error")}
          >
            <Archive className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {area.description ? (
        <p className="relative mt-4 line-clamp-3 text-body-md text-on-surface-variant">
          {area.description}
        </p>
      ) : (
        <p className="relative mt-4 text-body-md italic text-outline">No description yet.</p>
      )}

      <div className="relative mt-auto flex items-center justify-between gap-3 pt-6">
        <span className="text-label-sm uppercase text-on-surface-variant">Importance</span>
        <div
          className="flex items-center gap-1.5"
          aria-label={`Importance ${area.weight} of ${LIFE_AREA_WEIGHT_MAX}`}
        >
          {Array.from({ length: LIFE_AREA_WEIGHT_MAX }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-2 rounded-full transition-colors",
                i < area.weight ? color.swatch : "bg-surface-variant",
              )}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  );
}
