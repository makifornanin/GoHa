"use client";

import {
  Archive,
  ExternalLink,
  ListChecks,
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
import { BRAIN_DUMP_CONTENT_MAX, convertTargetConfig } from "@/lib/brain-dump";
import { formatZonedDateTimeMedium, MANILA_TZ } from "@/lib/date";
import { cn } from "@/lib/utils";

const CONVERT_ACTIONS: { target: ConvertTarget; icon: LucideIcon }[] = [
  { target: "task", icon: ListChecks },
  { target: "goal", icon: Trophy },
  { target: "habit", icon: Repeat },
];

function ActionButton({
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
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-surface-secondary px-2.5 text-footnote font-medium text-label transition-colors hover:bg-surface-pressed disabled:opacity-50",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
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
}: {
  item: BrainDumpItemRow;
  busy: boolean;
  timeZone?: string;
  onConvert: (id: string, target: ConvertTarget) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (item: BrainDumpItemRow) => void;
  onEdit: (id: string, content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);

  const isConverted = item.status === "converted";
  const isArchived = item.status === "archived";

  function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.content) onEdit(item.id, trimmed);
    setEditing(false);
  }

  return (
    <article
      data-testid="brain-dump-item"
      className={cn(
        "group rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1 transition-shadow hover:shadow-e2",
        (isConverted || isArchived) && "opacity-70",
      )}
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={BRAIN_DUMP_CONTENT_MAX}
            autoFocus
            className="min-h-20"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setDraft(item.content); setEditing(false); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={busy}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className={cn("whitespace-pre-wrap text-body text-label", isConverted && "text-label-secondary")}>
          {item.content}
        </p>
      )}

      {!editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isConverted ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-green/15 px-1.5 py-0.5 text-footnote text-green">
                Converted to {item.convertedType ? convertTargetConfig[item.convertedType].label : "entity"}
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
            <ActionButton onClick={() => onRestore(item.id)} icon={RotateCcw} label="Restore" disabled={busy} />
          ) : (
            <>
              {CONVERT_ACTIONS.map(({ target, icon }) => (
                <ActionButton
                  key={target}
                  onClick={() => onConvert(item.id, target)}
                  icon={icon}
                  label={`To ${convertTargetConfig[target].label}`}
                  disabled={busy}
                />
              ))}
              <ActionButton onClick={() => setEditing(true)} icon={Pencil} label="Edit" disabled={busy} />
              <ActionButton onClick={() => onArchive(item.id)} icon={Archive} label="Archive" disabled={busy} />
            </>
          )}

          <div className="flex-1" />
          <button
            type="button"
            onClick={() => onDelete(item)}
            disabled={busy}
            aria-label="Delete item"
            className="hit-44 hit-44-narrow inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-colors hover:text-red disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      <p className="mt-2 font-mono text-footnote tabular-nums text-label-tertiary">{formatZonedDateTimeMedium(item.createdAt, timeZone)}</p>
    </article>
  );
}
