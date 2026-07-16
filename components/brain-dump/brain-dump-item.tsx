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
import { formatManilaDateTimeMedium } from "@/lib/date";
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
        "inline-flex items-center gap-1.5 rounded-md border border-outline-variant/40 bg-surface-container px-3 py-1.5 text-label-sm text-on-surface transition-colors hover:bg-surface-variant disabled:opacity-50",
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
  onConvert,
  onArchive,
  onRestore,
  onDelete,
  onEdit,
}: {
  item: BrainDumpItemRow;
  busy: boolean;
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
        "group raised card-shadow rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-5 transition-colors hover:border-outline-variant",
        (isConverted || isArchived) && "opacity-80",
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
        <p className={cn("whitespace-pre-wrap text-body-md text-on-surface", isConverted && "text-on-surface-variant")}>
          {item.content}
        </p>
      )}

      {!editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isConverted ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary-container/30 px-2.5 py-1 text-label-sm text-on-primary-container">
                Converted to {item.convertedType ? convertTargetConfig[item.convertedType].label : "entity"}
              </span>
              {item.convertedType ? (
                <Link
                  href={convertTargetConfig[item.convertedType].module}
                  className="inline-flex items-center gap-1 text-label-sm text-primary hover:underline"
                >
                  View <ExternalLink className="size-3.5" aria-hidden />
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
            className="inline-flex size-8 items-center justify-center rounded-md text-outline transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <p className="tabular mt-2 font-mono text-mono-sm text-outline">{formatManilaDateTimeMedium(item.createdAt)}</p>
    </article>
  );
}
