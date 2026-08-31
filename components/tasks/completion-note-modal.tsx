"use client";

import { useState } from "react";

import type { ActionResult } from "@/app/(app)/tasks/actions";
import type { Task } from "@/db";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { TASK_COMPLETION_NOTE_MAX } from "@/lib/tasks";

function NoteFields({
  task,
  onSave,
  onClose,
}: {
  task: Task;
  onSave: (note: string) => Promise<ActionResult<Task>>;
  onClose: () => void;
}) {
  const [note, setNote] = useState(() => task.completionNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    const result = await onSave(note);
    if (!result.ok) {
      setSaving(false);
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      {error ? (
        <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">
          {error}
        </p>
      ) : null}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="completion-note" className="block text-label-md text-on-surface-variant">
            How did it go?
          </label>
          <span className="text-label-sm text-outline">
            {note.length}/{TASK_COMPLETION_NOTE_MAX}
          </span>
        </div>
        <Textarea
          id="completion-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={TASK_COMPLETION_NOTE_MAX}
          placeholder="What went well, what you learned, anything to remember."
          disabled={saving}
          autoFocus
        />
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-outline-variant pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} loading={saving}>
          Save reflection
        </Button>
      </div>
    </div>
  );
}

/** Small modal to capture persistent completion feedback for a task. */
export function CompletionNoteModal({
  task,
  onSave,
  onClose,
}: {
  task: Task | null;
  onSave: (note: string) => Promise<ActionResult<Task>>;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      title="Completion reflection"
      description="Optional feedback saved with this to-do."
    >
      {task ? <NoteFields task={task} onSave={onSave} onClose={onClose} /> : null}
    </Modal>
  );
}
