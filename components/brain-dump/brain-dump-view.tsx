"use client";

import { motion } from "motion/react";
import { Brain, CornerDownLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { listContainer, listItem } from "@/lib/motion";

import {
  archiveBrainDumpItemAction,
  captureBrainDumpItemAction,
  convertBrainDumpItemAction,
  deleteBrainDumpItemAction,
  restoreBrainDumpItemAction,
  updateBrainDumpItemAction,
} from "@/app/(app)/brain-dump/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { BrainDumpItem as BrainDumpItemRow } from "@/db";
import type { BrainDumpStatus } from "@/db/schema/enums";
import type { ConvertTarget } from "@/db/repositories/brain-dump";
import { BRAIN_DUMP_CONTENT_MAX, convertTargetConfig } from "@/lib/brain-dump";
import { cn } from "@/lib/utils";

import { BrainDumpItem } from "./brain-dump-item";

type Tab = BrainDumpStatus;
const TABS: { key: Tab; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "archived", label: "Archived" },
  { key: "converted", label: "Converted" },
];

type OptimisticAction =
  | { type: "add"; item: BrainDumpItemRow }
  | { type: "status"; id: string; status: BrainDumpStatus; convertedType?: ConvertTarget }
  | { type: "content"; id: string; content: string }
  | { type: "remove"; id: string };

export function BrainDumpView({ items, timeZone }: { items: BrainDumpItemRow[]; timeZone?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("inbox");
  const [draft, setDraft] = useState("");
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
      if (!result.ok) toast.error(result.error);
    });
  }

  function act(id: string, optimistic: OptimisticAction, run: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader title="Brain Dump" description="Fast capture for messy thoughts. Clear your mind." />

      <section className="raised card-shadow rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-1 transition-colors focus-within:border-primary/60">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") capture();
          }}
          maxLength={BRAIN_DUMP_CONTENT_MAX}
          placeholder="Capture anything..."
          aria-label="Capture a thought"
          className="min-h-28 border-none bg-transparent text-body-lg focus-visible:ring-0"
        />
        <div className="flex items-center justify-between border-t border-outline-variant/50 p-2">
          <span className="tabular pl-2 font-mono text-mono-sm text-outline">
            {draft.length}/{BRAIN_DUMP_CONTENT_MAX} · ⌘/Ctrl + Enter
          </span>
          <Button onClick={capture} disabled={draft.trim().length === 0} loading={capturePending}>
            <CornerDownLeft />
            Dump It
          </Button>
        </div>
      </section>

      <div>
        <div className="mb-4 flex gap-6 border-b border-outline-variant">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap py-3 text-label-md transition-colors",
                tab === t.key
                  ? "border-b-2 border-primary font-bold text-primary"
                  : "text-on-surface-variant hover:text-primary",
              )}
            >
              {t.label}
              {(counts.get(t.key) ?? 0) > 0 ? (
                <span className="tabular rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-mono-sm text-on-surface-variant">
                  {counts.get(t.key)}
                </span>
              ) : null}
            </button>
          ))}
        </div>

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
          <motion.div
            key={tab}
            variants={listContainer}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-4"
          >
            {visible.map((item) => (
              <motion.div key={item.id} variants={listItem} layout>
                <BrainDumpItem
                  item={item}
                  busy={busyId === item.id}
                  timeZone={timeZone}
                  onConvert={convert}
                  onArchive={(id) => act(id, { type: "status", id, status: "archived" }, () => archiveBrainDumpItemAction(id))}
                  onRestore={(id) => act(id, { type: "status", id, status: "inbox" }, () => restoreBrainDumpItemAction(id))}
                  onDelete={setDeleting}
                  onEdit={(id, content) => act(id, { type: "content", id, content }, () => updateBrainDumpItemAction(id, content))}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this item?"
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
