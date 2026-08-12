"use client";

import { motion } from "motion/react";
import {
  Archive,
  Check,
  ExternalLink,
  ListChecks,
  Palette,
  Pencil,
  Repeat,
  RotateCcw,
  Trash2,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BrainDumpItem as BrainDumpItemRow } from "@/db";
import type { ConvertTarget } from "@/db/repositories/brain-dump";
import {
  BRAIN_DUMP_CONTENT_MAX,
  convertTargetConfig,
  NOTE_COLOR_KEYS,
  noteColorConfig,
  toNoteColor,
  type NoteColorKey,
} from "@/lib/brain-dump";
import { formatZonedDateTimeMedium, MANILA_TZ } from "@/lib/date";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

const CONVERT_ACTIONS: { target: ConvertTarget; icon: LucideIcon }[] = [
  { target: "task", icon: ListChecks },
  { target: "goal", icon: Trophy },
  { target: "habit", icon: Repeat },
];

/**
 * A captured thought as a sticky note pinned to the wall: a coloured paper
 * square with a strip of tape, a slight resting tilt, and a lift on hover.
 * The tilt is derived from the item id so a note never jumps position between
 * renders.
 */
function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  // -1.6deg .. +1.6deg, enough to read as paper without looking broken.
  return ((Math.abs(hash) % 33) - 16) / 10;
}

function IconAction({
  onClick,
  icon: Icon,
  label,
  disabled,
  className,
}: {
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "hit-44 hit-44-narrow flex size-7 cursor-pointer items-center justify-center rounded-full text-label-secondary transition-colors hover:bg-black/5 hover:text-label disabled:opacity-40 dark:hover:bg-white/10",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}

export function BrainDumpItem({
  item,
  busy,
  timeZone = MANILA_TZ,
  onConvert,
  onArchive,
  onRestore,
  onDelete,
  onEdit,
  onRecolor,
}: {
  item: BrainDumpItemRow;
  busy: boolean;
  timeZone?: string;
  onConvert: (id: string, target: ConvertTarget) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (item: BrainDumpItemRow) => void;
  onEdit: (id: string, content: string) => void;
  onRecolor: (id: string, color: NoteColorKey) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(item.content);

  const isConverted = item.status === "converted";
  const isArchived = item.status === "archived";
  const color = noteColorConfig[toNoteColor(item.color)];
  const tilt = tiltFor(item.id);

  function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.content) onEdit(item.id, trimmed);
    setEditing(false);
  }

  return (
    <motion.article
      data-testid="brain-dump-item"
      layout
      initial={{ opacity: 0, scale: 0.94, rotate: tilt }}
      animate={{ opacity: 1, scale: 1, rotate: tilt }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ rotate: 0, y: -4, scale: 1.02, zIndex: 10 }}
      transition={spring.snappy}
      className={cn(
        "group relative flex h-full min-h-44 flex-col rounded-sm p-4 shadow-e2",
        color.surface,
        (isConverted || isArchived) && "opacity-70",
      )}
    >
      {/* The strip of tape holding it to the wall. */}
      <span
        aria-hidden
        className={cn(
          "absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 rounded-[2px] opacity-80 shadow-e1",
          color.tape,
        )}
      />

      {editing ? (
        <div className="flex flex-1 flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={BRAIN_DUMP_CONTENT_MAX}
            autoFocus
            className="min-h-24 flex-1 bg-white/50 dark:bg-black/20"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(item.content);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={busy}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p
          className={cn(
            "flex-1 whitespace-pre-wrap break-words text-body text-label",
            isConverted && "text-label-secondary",
          )}
        >
          {item.content}
        </p>
      )}

      {!editing ? (
        <>
          {/* Colour picker */}
          {picking ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.snappy}
              role="radiogroup"
              aria-label="Note colour"
              className="mb-2 flex flex-wrap items-center gap-1.5"
            >
              {NOTE_COLOR_KEYS.map((key) => {
                const selected = toNoteColor(item.color) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={noteColorConfig[key].label}
                    onClick={() => {
                      onRecolor(item.id, key);
                      setPicking(false);
                    }}
                    // Padded target, 24px dot inside (see the capture bar).
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-blue/40"
                  >
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full",
                        noteColorConfig[key].swatch,
                      )}
                    >
                      {selected ? <Check className="size-3.5 text-white" aria-hidden /> : null}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          ) : null}

          <div className="mt-2 flex items-center gap-1 border-t border-black/5 pt-2 dark:border-white/10">
            {isConverted ? (
              <>
                <span className="rounded-sm bg-black/5 px-1.5 py-0.5 text-footnote text-label-secondary dark:bg-white/10">
                  → {item.convertedType ? convertTargetConfig[item.convertedType].label : "entity"}
                </span>
                {item.convertedType ? (
                  <Link
                    href={convertTargetConfig[item.convertedType].module}
                    className="inline-flex items-center gap-1 text-footnote font-medium text-blue hover:underline"
                  >
                    View <ExternalLink className="size-3" aria-hidden />
                  </Link>
                ) : null}
              </>
            ) : isArchived ? (
              <IconAction
                onClick={() => onRestore(item.id)}
                icon={RotateCcw}
                label="Restore"
                disabled={busy}
              />
            ) : (
              <>
                {CONVERT_ACTIONS.map(({ target, icon }) => (
                  <IconAction
                    key={target}
                    onClick={() => onConvert(item.id, target)}
                    icon={icon}
                    label={`Convert to ${convertTargetConfig[target].label}`}
                    disabled={busy}
                  />
                ))}
                <IconAction
                  onClick={() => setPicking((v) => !v)}
                  icon={Palette}
                  label="Change colour"
                  disabled={busy}
                />
                <IconAction onClick={() => setEditing(true)} icon={Pencil} label="Edit" disabled={busy} />
                <IconAction
                  onClick={() => onArchive(item.id)}
                  icon={Archive}
                  label="Archive"
                  disabled={busy}
                />
              </>
            )}

            <div className="flex-1" />
            <IconAction
              onClick={() => onDelete(item)}
              icon={Trash2}
              label="Delete"
              disabled={busy}
              className="hover:text-red"
            />
          </div>

          <p className="mt-1 font-mono text-footnote tabular-nums text-label-tertiary">
            {formatZonedDateTimeMedium(item.createdAt, timeZone)}
          </p>
        </>
      ) : null}
    </motion.article>
  );
}
