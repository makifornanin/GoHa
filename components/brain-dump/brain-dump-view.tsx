"use client";

import { AnimatePresence } from "motion/react";
import { Brain, CornerDownLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  archiveBrainDumpItemAction,
  captureBrainDumpItemAction,
  convertBrainDumpItemAction,
  deleteBrainDumpItemAction,
  restoreBrainDumpItemAction,
  setBrainDumpColorAction,
  updateBrainDumpItemAction,
} from "@/app/(app)/brain-dump/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import type { BrainDumpItem as BrainDumpItemRow } from "@/db";
import type { BrainDumpStatus } from "@/db/schema/enums";
import type { ConvertTarget } from "@/db/repositories/brain-dump";
import {
  BRAIN_DUMP_CONTENT_MAX,
  convertTargetConfig,
  DEFAULT_NOTE_COLOR,
  NOTE_COLOR_KEYS,
  noteColorConfig,
  type NoteColorKey,
} from "@/lib/brain-dump";
import { cn } from "@/lib/utils";

import { BrainDumpItem } from "./brain-dump-item";

type Tab = BrainDumpStatus;
const TABS: { key: Tab; label: string }[] = [
  { key: "inbox", label: "Wall" },
  { key: "archived", label: "Archived" },
  { key: "converted", label: "Converted" },
];

type OptimisticAction =
  | { type: "add"; item: BrainDumpItemRow }
  | { type: "status"; id: string; status: BrainDumpStatus; convertedType?: ConvertTarget }
  | { type: "content"; id: string; content: string }
  | { type: "color"; id: string; color: NoteColorKey }
  | { type: "remove"; id: string };

export function BrainDumpView({
  items,
  timeZone,
}: {
  items: BrainDumpItemRow[];
  timeZone?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("inbox");
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState<NoteColorKey>(DEFAULT_NOTE_COLOR);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BrainDumpItemRow | null>(null);
  const [capturePending, startCapture] = useTransition();
  const [, startAction] = useTransition();

  const [optimisticItems, apply] = useOptimistic(items, (state, action: OptimisticAction) => {
    switch (action.type) {
      case "add":
        return [action.item, ...state];
      case "remove":
        return state.filter((i) => i.id !== action.id);
      case "status":
        return state.map((i) =>
          i.id === action.id
            ? { ...i, status: action.status, convertedType: action.convertedType ?? i.convertedType }
            : i,
        );
      case "content":
        return state.map((i) => (i.id === action.id ? { ...i, content: action.content } : i));
      case "color":
        return state.map((i) => (i.id === action.id ? { ...i, color: action.color } : i));
    }
  });

  const counts = useMemo(() => {
    const map = new Map<Tab, number>();
    for (const t of TABS) map.set(t.key, optimisticItems.filter((i) => i.status === t.key).length);
    return map;
  }, [optimisticItems]);

  const visible = optimisticItems.filter((i) => i.status === tab);

  function capture() {
    const content = draft.trim();
    if (!content || capturePending) return;
    const now = new Date();
    const optimistic: BrainDumpItemRow = {
      id: `optimistic-${now.getTime()}`,
      userId: "",
      content,
      status: "inbox",
      color: draftColor,
      convertedType: null,
      convertedEntityId: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    startCapture(async () => {
      apply({ type: "add", item: optimistic });
      setDraft("");
      const result = await captureBrainDumpItemAction(content);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Capture stays a single fast field; the chosen colour is applied to the
      // note the server just created.
      if (draftColor !== DEFAULT_NOTE_COLOR) {
        await setBrainDumpColorAction(result.data.id, draftColor);
      }
    });
  }

  function act(
    id: string,
    optimistic: OptimisticAction,
    run: () => Promise<{ ok: boolean; error?: string }>,
    onOk?: () => void,
  ) {
    setBusyId(id);
    startAction(async () => {
      apply(optimistic);
      const result = await run();
      setBusyId(null);
      if (result.ok) onOk?.();
      else toast.error(result.error ?? "Something went wrong.");
    });
  }

  function convert(id: string, target: ConvertTarget) {
    act(
      id,
      { type: "status", id, status: "converted", convertedType: target },
      () => convertBrainDumpItemAction(id, target),
      () =>
        toast.success(`Converted to ${convertTargetConfig[target].label}`, {
          action: { label: "View", onClick: () => router.push(convertTargetConfig[target].module) },
        }),
    );
  }

  function confirmDelete() {
    const item = deleting;
    if (!item) return;
    setDeleting(null);
    act(item.id, { type: "remove", id: item.id }, () => deleteBrainDumpItemAction(item.id));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Brain Dump" description="Fast capture for messy thoughts. Clear your mind." />

      {/* Capture: one field, a colour, one key to post it. */}
      <section className="rounded-2xl border border-separator-opaque bg-surface p-1 shadow-e1 transition-colors focus-within:border-blue/40">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") capture();
          }}
          maxLength={BRAIN_DUMP_CONTENT_MAX}
          placeholder="Capture anything..."
          aria-label="Capture a thought"
          className="min-h-24 bg-transparent text-body-lg focus-visible:bg-transparent focus-visible:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-separator p-2">
          {/* The tap target is the padded button; the dot inside stays 20px.
              Growing the dot itself would be heavy, and the shared `hit-44`
              helper cannot be used on a tight row like this: six 36px hit areas
              on a 26px pitch would overlap and steal each other's taps. */}
          <div className="flex items-center" role="radiogroup" aria-label="Note colour">
            {NOTE_COLOR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={draftColor === key}
                aria-label={noteColorConfig[key].label}
                onClick={() => setDraftColor(key)}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-blue/40"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-5 rounded-full",
                    noteColorConfig[key].swatch,
                    draftColor === key &&
                      "outline-solid outline-2 outline-offset-2 outline-label-tertiary",
                  )}
                />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-footnote tabular-nums text-label-tertiary">
              {draft.length}/{BRAIN_DUMP_CONTENT_MAX} · ⌘/Ctrl + Enter
            </span>
            <Button onClick={capture} disabled={draft.trim().length === 0} loading={capturePending}>
              <CornerDownLeft />
              Pin it
            </Button>
          </div>
        </div>
      </section>

      <SegmentedControl
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        ariaLabel="Filter notes"
        className="self-start"
        options={TABS.map((t) => {
          const count = counts.get(t.key) ?? 0;
          return { value: t.key, label: count > 0 ? `${t.label} · ${count}` : t.label };
        })}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={Brain}
          title={tab === "inbox" ? "Your mind is clear" : `Nothing ${tab}`}
          description={
            tab === "inbox"
              ? "Capture anything above and it lands here. Convert thoughts into tasks, goals, or habits when you're ready."
              : `Items you ${tab === "archived" ? "archive" : "convert"} will show up here.`
          }
        />
      ) : (
        /* A wall of notes.
           This was a CSS multi-column (`columns-*`) masonry, but the column
           algorithm FRAGMENTS absolutely positioned descendants across column
           boxes: each note's strip of tape was painted a second time below the
           note (measured: a 56x16 tape reporting a 411x184 border box). A grid
           has no fragmentation, and a wall of equal tiles reads more like a real
           board than ragged columns did. */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {visible.map((item) => (
              <div key={item.id}>
                <BrainDumpItem
                  item={item}
                  busy={busyId === item.id}
                  timeZone={timeZone}
                  onConvert={convert}
                  onArchive={(id) =>
                    act(id, { type: "status", id, status: "archived" }, () =>
                      archiveBrainDumpItemAction(id),
                    )
                  }
                  onRestore={(id) =>
                    act(id, { type: "status", id, status: "inbox" }, () =>
                      restoreBrainDumpItemAction(id),
                    )
                  }
                  onDelete={setDeleting}
                  onEdit={(id, content) =>
                    act(id, { type: "content", id, content }, () =>
                      updateBrainDumpItemAction(id, content),
                    )
                  }
                  onRecolor={(id, color) =>
                    act(id, { type: "color", id, color }, () => setBrainDumpColorAction(id, color))
                  }
                />
              </div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this note?"
        description="This permanently removes the captured thought. It cannot be undone."
      >
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
