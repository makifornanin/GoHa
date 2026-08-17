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
  const [, startAction] = useTransition();

  /*
   * Captures in flight, held OUTSIDE useOptimistic (audit R-10).
   *
   * The old capture path put its optimistic insert inside a shared
   * useTransition. That transition's pending flag clears when the action
   * promise resolves, but the revalidated props commit a moment later, so a
   * second capture started in that gap joined a transition whose optimistic
   * base was mid-change. The result was a transition that never settled: the
   * button stayed disabled with aria-busy, no error appeared, and only a
   * reload cleared it. Anything faster than about 400ms hit it, which meant a
   * paste-and-click user or an automation.
   *
   * Each capture is now an independent promise with its own row in this list,
   * so there is no shared transition to get stuck in and no reason to block
   * the field between captures. The other actions keep useOptimistic: they
   * mutate rows the server already has, and were never part of the fault.
   */
  const [inFlight, setInFlight] = useState<BrainDumpItemRow[]>([]);

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

  /**
   * Placeholders whose real row has not arrived yet.
   *
   * Reconciled by CONTENT COUNT rather than by id (the server picks a different
   * id) or by a set membership test (capturing the same thought twice on
   * purpose is legitimate, and a set would hide the second one). For each
   * distinct content, as many placeholders are retired as there are server rows
   * holding it; the rest stay on screen.
   *
   * Deriving this rather than deleting on settle is deliberate. An earlier
   * version removed the placeholder when the action resolved, which put the
   * note's visibility back in the hands of revalidation timing: exactly the
   * coupling R-10 came from. Now a slow, failed or entirely absent refresh
   * leaves the note where the user put it.
   */
  const unsettled = useMemo(() => {
    if (inFlight.length === 0) return inFlight;
    const available = new Map<string, number>();
    for (const item of optimisticItems) {
      if (item.status !== "inbox") continue;
      available.set(item.content, (available.get(item.content) ?? 0) + 1);
    }
    // Oldest first, so the earliest placeholder is the one a new row retires.
    const keep: BrainDumpItemRow[] = [];
    for (let i = inFlight.length - 1; i >= 0; i -= 1) {
      const item = inFlight[i];
      const covered = available.get(item.content) ?? 0;
      if (covered > 0) available.set(item.content, covered - 1);
      else keep.push(item);
    }
    return keep.reverse();
  }, [inFlight, optimisticItems]);

  const counts = useMemo(() => {
    const map = new Map<Tab, number>();
    for (const t of TABS) {
      const settled = optimisticItems.filter((i) => i.status === t.key).length;
      map.set(t.key, t.key === "inbox" ? settled + unsettled.length : settled);
    }
    return map;
  }, [optimisticItems, unsettled]);

  const visible =
    tab === "inbox"
      ? [...unsettled, ...optimisticItems.filter((i) => i.status === "inbox")]
      : optimisticItems.filter((i) => i.status === tab);

  function capture() {
    const content = draft.trim();
    if (!content) return;

    const now = new Date();
    // Unique per capture, not per millisecond: two captures inside the same
    // millisecond used to collide on `optimistic-${now.getTime()}` and React
    // then reconciled two list rows onto one key.
    const key = `pending-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    const color = draftColor;
    const optimistic: BrainDumpItemRow = {
      id: key,
      userId: "",
      content,
      status: "inbox",
      color,
      convertedType: null,
      convertedEntityId: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    /*
     * Add the new placeholder and, in the same update, drop any earlier ones
     * the server has since confirmed. Pruning here rather than on a timer or an
     * effect keeps the list bounded without introducing another moving part.
     */
    setInFlight((current) => {
      const available = new Map<string, number>();
      for (const item of items) {
        if (item.status !== "inbox") continue;
        available.set(item.content, (available.get(item.content) ?? 0) + 1);
      }
      const kept: BrainDumpItemRow[] = [];
      for (let i = current.length - 1; i >= 0; i -= 1) {
        const item = current[i];
        const covered = available.get(item.content) ?? 0;
        if (covered > 0) available.set(item.content, covered - 1);
        else kept.push(item);
      }
      return [optimistic, ...kept.reverse()];
    });
    setDraft("");

    void (async () => {
      try {
        const result = await captureBrainDumpItemAction(content);
        if (!result.ok) {
          toast.error(result.error);
          // Nothing was written, so the placeholder is a lie. Take it back.
          startAction(() => setInFlight((c) => c.filter((item) => item.id !== key)));
          return;
        }
        // Capture stays a single fast field; the chosen colour is applied to
        // the note the server just created.
        if (color !== DEFAULT_NOTE_COLOR) {
          await setBrainDumpColorAction(result.data.id, color);
        }
        // On success the placeholder is left in place. `unsettled` retires it
        // the moment the real row appears, so there is no window where the
        // note is missing and no dependence on when the refresh lands.
      } catch (error) {
        console.error("captureBrainDumpItemAction failed", error);
        toast.error("Could not save that thought. Please try again.");
        startAction(() => setInFlight((c) => c.filter((item) => item.id !== key)));
      }
    })();
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
            {/* Never disabled by an in-flight capture. Each one is independent,
                so blocking the field between them bought nothing and was the
                surface the stuck-pending state appeared on (audit R-10). */}
            <Button onClick={capture} disabled={draft.trim().length === 0}>
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
