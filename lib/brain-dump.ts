import type { BrainDumpConvertedType } from "@/db/schema/enums";

/** Shared, client-safe constants for Brain Dump. */

export const BRAIN_DUMP_CONTENT_MAX = 2000;

export const CONVERT_TARGETS = ["task", "goal", "habit"] as const satisfies readonly BrainDumpConvertedType[];

export const convertTargetConfig: Record<BrainDumpConvertedType, { label: string; module: string }> = {
  task: { label: "Task", module: "/tasks" },
  goal: { label: "Goal", module: "/goals" },
  habit: { label: "Habit", module: "/habits" },
};

/**
 * Sticky-note colours. Only KEYS are stored; the classes below are the
 * presentation layer, so the palette can change without touching data
 * (CLAUDE.md section 9). Tints are deliberately soft so note text stays
 * readable in both themes.
 */
export const NOTE_COLOR_KEYS = [
  "yellow",
  "blue",
  "green",
  "pink",
  "purple",
  "gray",
] as const;
export type NoteColorKey = (typeof NOTE_COLOR_KEYS)[number];
export const DEFAULT_NOTE_COLOR: NoteColorKey = "yellow";

type NoteColor = {
  label: string;
  /** Note body. */
  surface: string;
  /** Small swatch in the colour picker. */
  swatch: string;
  /** The "tape" holding the note to the wall. */
  tape: string;
};

export const noteColorConfig: Record<NoteColorKey, NoteColor> = {
  yellow: {
    label: "Yellow",
    surface: "bg-yellow/25 dark:bg-yellow/15",
    swatch: "bg-yellow",
    tape: "bg-yellow/50",
  },
  blue: {
    label: "Blue",
    surface: "bg-blue/15 dark:bg-blue/20",
    swatch: "bg-blue",
    tape: "bg-blue/40",
  },
  green: {
    label: "Green",
    surface: "bg-green/18 dark:bg-green/20",
    swatch: "bg-green",
    tape: "bg-green/40",
  },
  pink: {
    label: "Pink",
    surface: "bg-pink/15 dark:bg-pink/20",
    swatch: "bg-pink",
    tape: "bg-pink/40",
  },
  purple: {
    label: "Purple",
    surface: "bg-purple/15 dark:bg-purple/20",
    swatch: "bg-purple",
    tape: "bg-purple/40",
  },
  gray: {
    label: "Gray",
    surface: "bg-gray-5",
    swatch: "bg-gray-2",
    tape: "bg-gray-3",
  },
};

/** Narrow an arbitrary stored value to a known colour key. */
export function toNoteColor(value: string | null | undefined): NoteColorKey {
  return NOTE_COLOR_KEYS.includes(value as NoteColorKey)
    ? (value as NoteColorKey)
    : DEFAULT_NOTE_COLOR;
}
