CREATE TYPE "public"."habit_entry_status" AS ENUM('done', 'missed', 'skipped');--> statement-breakpoint
ALTER TABLE "habit_entries" ADD COLUMN "status" "habit_entry_status" DEFAULT 'done' NOT NULL;