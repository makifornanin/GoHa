ALTER TABLE "brain_dump_items" DROP CONSTRAINT "brain_dump_items_converted_task_id_tasks_id_fk";
--> statement-breakpoint
DROP INDEX "brain_dump_items_converted_task_id_idx";--> statement-breakpoint
ALTER TABLE "brain_dump_items" DROP COLUMN "converted_task_id";