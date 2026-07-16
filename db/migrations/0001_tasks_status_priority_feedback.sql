-- Rename the task status value done -> completed (preserves existing rows).
ALTER TYPE "public"."task_status" RENAME VALUE 'done' TO 'completed';--> statement-breakpoint
-- Add the new urgent priority level (appended after high).
ALTER TYPE "public"."priority" ADD VALUE 'urgent';--> statement-breakpoint
-- Persistent completion feedback captured during or after completing a task.
ALTER TABLE "tasks" ADD COLUMN "completion_note" text;
