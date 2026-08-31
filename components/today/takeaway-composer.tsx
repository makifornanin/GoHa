"use client";

import { Check, PenLine } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveTakeawayAction } from "@/app/(app)/today/takeaway-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TAKEAWAY_MAX } from "@/lib/validations/takeaway";

/**
 * "My Takeaway": one line of the reader's own thinking about today's verse or
 * quote.
 *
 * Collapsed to a single quiet button until it is wanted. The inspiration card
 * sits in a column beside real work on the busiest screen in the app, and a
 * permanently open textarea there is a demand for input every morning rather
 * than an invitation. Once something is written it is shown, because then it IS
 * the content.
 *
 * The text is the user's own and stays that way: nothing here rewrites,
 * summarises, or suggests. GoHa stores it verbatim (CLAUDE.md section 10).
 *
 * Deliberately not a journal. One entry a day, plain text, no title, no tags,
 * no mood picker. The purpose is a moment of reflection, and the reliable way
 * to prevent one is to hand somebody a form.
 */
export function TakeawayComposer({ initialBody }: { initialBody: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [saved, setSaved] = useState(initialBody);
  const [pending, startTransition] = useTransition();

  const dirty = body.trim() !== saved.trim();

  function save() {
    startTransition(async () => {
      const result = await saveTakeawayAction(body);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const next = result.data.takeaway?.body ?? "";
      setSaved(next);
      setBody(next);
      setOpen(false);
      toast.success(next ? "Takeaway saved" : "Takeaway cleared");
    });
  }

  // Read mode: something written, and not currently being edited.
  if (!open && saved.trim().length > 0) {
    return (
      <div className="border-t border-separator px-4 py-3">
        <p className="mb-1 flex items-center gap-1.5 text-footnote font-medium uppercase tracking-wide text-label-tertiary">
          <PenLine className="size-3" aria-hidden />
          My takeaway
        </p>
        <p className="whitespace-pre-wrap text-callout leading-relaxed text-label">{saved}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="touch-target mt-1 cursor-pointer text-footnote font-medium text-blue hover:underline focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
        >
          Edit
        </button>
      </div>
    );
  }

  // Invitation: nothing written yet, and not being written.
  if (!open) {
    return (
      <div className="border-t border-separator px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="touch-target flex w-full cursor-pointer items-center gap-2 rounded-lg text-left text-callout text-label-secondary transition-colors hover:text-label focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
        >
          <PenLine className="size-3.5 shrink-0 text-label-tertiary" aria-hidden />
          Write what this means to you
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-separator px-4 py-3">
      <label
        htmlFor="takeaway-body"
        className="mb-1.5 flex items-center gap-1.5 text-footnote font-medium uppercase tracking-wide text-label-tertiary"
      >
        <PenLine className="size-3" aria-hidden />
        My takeaway
      </label>
      <Textarea
        id="takeaway-body"
        value={body}
        autoFocus
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") save();
          if (event.key === "Escape") {
            setBody(saved);
            setOpen(false);
          }
        }}
        maxLength={TAKEAWAY_MAX}
        disabled={pending}
        placeholder="Write what this means to you..."
        className="min-h-20"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span
          className={cn(
            "font-mono text-footnote tabular-nums",
            body.length > TAKEAWAY_MAX - 40 ? "text-orange" : "text-label-quaternary",
          )}
        >
          {body.length}/{TAKEAWAY_MAX}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setBody(saved);
              setOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={save} loading={pending} disabled={pending || !dirty}>
            <Check aria-hidden />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
