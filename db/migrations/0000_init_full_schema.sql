CREATE TYPE "public"."brain_dump_status" AS ENUM('inbox', 'converted', 'archived');--> statement-breakpoint
CREATE TYPE "public"."focus_session_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."goal_progress_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('not_started', 'active', 'paused', 'completed', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."goal_timeframe" AS ENUM('daily', 'weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."habit_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."habit_type" AS ENUM('boolean', 'numeric');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_map_node_type" AS ENUM('task', 'note', 'group', 'milestone');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."theme_preference" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "life_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "life_areas_weight_positive" CHECK ("life_areas"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "goal_progress_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"progress" smallint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_progress_updates_range" CHECK ("goal_progress_updates"."progress" >= 0 and "goal_progress_updates"."progress" <= 100)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"life_area_id" uuid,
	"parent_goal_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "goal_status" DEFAULT 'not_started' NOT NULL,
	"timeframe" "goal_timeframe",
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"progress_mode" "goal_progress_mode" DEFAULT 'auto' NOT NULL,
	"manual_progress" smallint,
	"start_date" date,
	"target_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_manual_progress_range" CHECK ("goals"."manual_progress" is null or ("goals"."manual_progress" >= 0 and "goals"."manual_progress" <= 100)),
	CONSTRAINT "goals_no_self_parent" CHECK ("goals"."parent_goal_id" is null or "goals"."parent_goal_id" <> "goals"."id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"life_area_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"scheduled_for" date,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"estimate_minutes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_estimate_minutes_positive" CHECK ("tasks"."estimate_minutes" is null or "tasks"."estimate_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "habit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"completed" boolean DEFAULT true NOT NULL,
	"value" numeric(12, 4),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_entries_habit_id_entry_date_uq" UNIQUE("habit_id","entry_date"),
	CONSTRAINT "habit_entries_value_non_negative" CHECK ("habit_entries"."value" is null or "habit_entries"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "habit_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"frequency" "habit_frequency" DEFAULT 'daily' NOT NULL,
	"days_of_week" integer[],
	"days_of_month" integer[],
	"times_per_period" smallint,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"life_area_id" uuid,
	"goal_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"type" "habit_type" DEFAULT 'boolean' NOT NULL,
	"target_value" numeric(12, 4),
	"unit" text,
	"higher_is_better" boolean DEFAULT true NOT NULL,
	"color" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habits_numeric_requires_target" CHECK ("habits"."type" <> 'numeric' or "habits"."target_value" is not null)
);
--> statement-breakpoint
CREATE TABLE "focus_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"session_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"planned_duration_seconds" integer,
	"duration_seconds" integer,
	"status" "focus_session_status" DEFAULT 'in_progress' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "focus_sessions_duration_non_negative" CHECK ("focus_sessions"."duration_seconds" is null or "focus_sessions"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "brain_dump_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" "brain_dump_status" DEFAULT 'inbox' NOT NULL,
	"converted_task_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"priority_date" date NOT NULL,
	"position" smallint NOT NULL,
	"task_id" uuid,
	"label" text,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_priorities_user_date_position_uq" UNIQUE("user_id","priority_date","position"),
	CONSTRAINT "daily_priorities_position_range" CHECK ("daily_priorities"."position" between 1 and 3),
	CONSTRAINT "daily_priorities_task_or_label" CHECK ("daily_priorities"."task_id" is not null or "daily_priorities"."label" is not null)
);
--> statement-breakpoint
CREATE TABLE "task_map_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_map_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"label" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_map_edges_source_target_uq" UNIQUE("task_map_id","source_node_id","target_node_id"),
	CONSTRAINT "task_map_edges_no_self_loop" CHECK ("task_map_edges"."source_node_id" <> "task_map_edges"."target_node_id")
);
--> statement-breakpoint
CREATE TABLE "task_map_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_map_id" uuid NOT NULL,
	"task_id" uuid,
	"node_type" "task_map_node_type" DEFAULT 'task' NOT NULL,
	"label" text,
	"position_x" double precision DEFAULT 0 NOT NULL,
	"position_y" double precision DEFAULT 0 NOT NULL,
	"width" double precision,
	"height" double precision,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"goal_id" uuid,
	"life_area_id" uuid,
	"viewport" jsonb,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"theme" "theme_preference" DEFAULT 'system' NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"daily_planning_time" time,
	"evening_reflection_time" time,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"preferences" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "user_settings_week_starts_on_range" CHECK ("user_settings"."week_starts_on" between 0 and 6)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_areas" ADD CONSTRAINT "life_areas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress_updates" ADD CONSTRAINT "goal_progress_updates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress_updates" ADD CONSTRAINT "goal_progress_updates_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_goal_id_goals_id_fk" FOREIGN KEY ("parent_goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_schedules" ADD CONSTRAINT "habit_schedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_schedules" ADD CONSTRAINT "habit_schedules_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_dump_items" ADD CONSTRAINT "brain_dump_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_dump_items" ADD CONSTRAINT "brain_dump_items_converted_task_id_tasks_id_fk" FOREIGN KEY ("converted_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_priorities" ADD CONSTRAINT "daily_priorities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_priorities" ADD CONSTRAINT "daily_priorities_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_map_edges" ADD CONSTRAINT "task_map_edges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_map_edges" ADD CONSTRAINT "task_map_edges_task_map_id_task_maps_id_fk" FOREIGN KEY ("task_map_id") REFERENCES "public"."task_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_map_edges" ADD CONSTRAINT "task_map_edges_source_node_id_task_map_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."task_map_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_map_edges" ADD CONSTRAINT "task_map_edges_target_node_id_task_map_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."task_map_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_map_nodes" ADD CONSTRAINT "task_map_nodes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_map_nodes" ADD CONSTRAINT "task_map_nodes_task_map_id_task_maps_id_fk" FOREIGN KEY ("task_map_id") REFERENCES "public"."task_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_map_nodes" ADD CONSTRAINT "task_map_nodes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_maps" ADD CONSTRAINT "task_maps_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_maps" ADD CONSTRAINT "task_maps_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_maps" ADD CONSTRAINT "task_maps_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "life_areas_user_id_idx" ON "life_areas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "life_areas_user_active_idx" ON "life_areas" USING btree ("user_id","is_archived");--> statement-breakpoint
CREATE INDEX "goal_progress_updates_goal_id_idx" ON "goal_progress_updates" USING btree ("goal_id","created_at");--> statement-breakpoint
CREATE INDEX "goal_progress_updates_user_id_idx" ON "goal_progress_updates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_user_id_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_user_status_idx" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "goals_user_timeframe_idx" ON "goals" USING btree ("user_id","timeframe");--> statement-breakpoint
CREATE INDEX "goals_life_area_id_idx" ON "goals" USING btree ("life_area_id");--> statement-breakpoint
CREATE INDEX "goals_parent_goal_id_idx" ON "goals" USING btree ("parent_goal_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_status_idx" ON "tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_user_scheduled_for_idx" ON "tasks" USING btree ("user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "tasks_user_due_at_idx" ON "tasks" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "tasks_goal_id_idx" ON "tasks" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "tasks_life_area_id_idx" ON "tasks" USING btree ("life_area_id");--> statement-breakpoint
CREATE INDEX "habit_entries_user_entry_date_idx" ON "habit_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "habit_schedules_habit_id_idx" ON "habit_schedules" USING btree ("habit_id");--> statement-breakpoint
CREATE INDEX "habit_schedules_user_id_idx" ON "habit_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habits_user_id_idx" ON "habits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habits_user_active_idx" ON "habits" USING btree ("user_id","is_archived");--> statement-breakpoint
CREATE INDEX "habits_life_area_id_idx" ON "habits" USING btree ("life_area_id");--> statement-breakpoint
CREATE INDEX "focus_sessions_user_session_date_idx" ON "focus_sessions" USING btree ("user_id","session_date");--> statement-breakpoint
CREATE INDEX "focus_sessions_task_id_idx" ON "focus_sessions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "brain_dump_items_user_status_idx" ON "brain_dump_items" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "brain_dump_items_converted_task_id_idx" ON "brain_dump_items" USING btree ("converted_task_id");--> statement-breakpoint
CREATE INDEX "daily_priorities_user_date_idx" ON "daily_priorities" USING btree ("user_id","priority_date");--> statement-breakpoint
CREATE INDEX "task_map_edges_task_map_id_idx" ON "task_map_edges" USING btree ("task_map_id");--> statement-breakpoint
CREATE INDEX "task_map_nodes_task_map_id_idx" ON "task_map_nodes" USING btree ("task_map_id");--> statement-breakpoint
CREATE INDEX "task_map_nodes_task_id_idx" ON "task_map_nodes" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_maps_user_id_idx" ON "task_maps" USING btree ("user_id");