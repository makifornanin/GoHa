ALTER TYPE "public"."task_map_node_type" ADD VALUE 'decision';--> statement-breakpoint
ALTER TYPE "public"."task_map_node_type" ADD VALUE 'blocker';--> statement-breakpoint
ALTER TYPE "public"."task_map_node_type" ADD VALUE 'phase';--> statement-breakpoint
ALTER TABLE "task_map_nodes" ADD COLUMN "note" text;