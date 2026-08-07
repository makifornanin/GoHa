"use client";

import { motion } from "motion/react";
import { Plus, Shapes } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { listContainer, listItem } from "@/lib/motion";

import {
  archiveLifeAreaAction,
  createLifeAreaAction,
  updateLifeAreaAction,
} from "@/app/(app)/life-areas/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { LifeAreaWithCounts } from "@/db/repositories/life-areas";
import type { LifeAreaFormInput } from "@/lib/validations/life-area";

import { LifeAreaCard } from "./life-area-card";
import { LifeAreaFormModal } from "./life-area-form-modal";

/**
 * Interactive Life Areas surface. Receives the server-fetched areas and owns the
 * create/edit modal, archive confirmation, and optimistic archive. Create and
 * edit rely on Server Action revalidation; archive is optimistic with a visible
 * rollback if the save fails (CLAUDE.md section 9).
 */
export function LifeAreasView({ areas }: { areas: LifeAreaWithCounts[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LifeAreaWithCounts | null>(null);
  const [archiving, setArchiving] = useState<LifeAreaWithCounts | null>(null);
  const [, startTransition] = useTransition();

  // Optimistic archive: hide the area immediately; it reappears if the save fails.
  const [optimisticAreas, removeOptimistically] = useOptimistic(
    areas,
    (state, archivedId: string) => state.filter((area) => area.id !== archivedId),
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(area: LifeAreaWithCounts) {
    setEditing(area);
    setFormOpen(true);
  }

  async function handleCreate(values: LifeAreaFormInput) {
    const result = await createLifeAreaAction(values);
    if (result.ok) {
      toast.success(`Created "${result.data.name}"`);
      setFormOpen(false);
    }
    return result;
  }

  async function handleUpdate(values: LifeAreaFormInput) {
    if (!editing) {
      return { ok: false as const, error: "Nothing to update." };
    }
    const result = await updateLifeAreaAction(editing.id, values);
    if (result.ok) {
      toast.success(`Updated "${result.data.name}"`);
      setFormOpen(false);
    }
    return result;
  }

  function confirmArchive() {
    const area = archiving;
    if (!area) return;
    setArchiving(null);
    startTransition(async () => {
      removeOptimistically(area.id);
      const result = await archiveLifeAreaAction(area.id);
      if (result.ok) {
        toast.success(`Archived "${area.name}"`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Life Areas"
        description="A high-level overview of your life balance. Organize goals and habits across the domains that matter to you."
        action={
          <Button data-testid="new-life-area" onClick={openCreate}>
            <Plus />
            New Life Area
          </Button>
        }
      />

      {optimisticAreas.length === 0 ? (
        <EmptyState
          icon={Shapes}
          title="No life areas yet"
          description="Life areas are the top of your system: create one for each domain of your life, like Health, Career, or Finance."
          action={
            <Button onClick={openCreate}>
              <Plus />
              Create your first life area
            </Button>
          }
        />
      ) : (
        <motion.div
          variants={listContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {optimisticAreas.map((area) => (
            <motion.div key={area.id} variants={listItem} layout className="h-full">
              <LifeAreaCard area={area} onEdit={openEdit} onArchive={setArchiving} />
            </motion.div>
          ))}
        </motion.div>
      )}

      <LifeAreaFormModal
        open={formOpen}
        mode={editing ? "edit" : "create"}
        area={editing}
        usedColors={optimisticAreas.map((a) => a.color)}
        onSubmit={editing ? handleUpdate : handleCreate}
        onClose={() => setFormOpen(false)}
      />

      <Modal
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        title="Archive this life area?"
        description={
          archiving
            ? `"${archiving.name}" will be hidden from your active areas. You can restore it later; nothing is permanently deleted.`
            : undefined
        }
      >
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button variant="ghost" onClick={() => setArchiving(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmArchive}>
            Archive
          </Button>
        </div>
      </Modal>
    </div>
  );
}
