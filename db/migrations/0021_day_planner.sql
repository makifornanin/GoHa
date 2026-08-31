-- Day Planner (24-hour capacity planning).
--
-- ROLLBACK CHARACTERISTICS: fully additive and cleanly reversible. Three new
-- tables and one new enum type; NOTHING existing is altered, renamed or
-- dropped, so an app built before this migration runs unchanged against a
-- database that has it.
--
-- TO ROLL BACK, in this order (children first, because of the foreign keys):
--   DROP TABLE day_plan_items;
--   DROP TABLE day_plan_allocations;
--   DROP TABLE day_plans;
--   DROP TYPE planner_category_kind;
--
-- That discards any plans users have made. It does NOT touch their to-dos:
-- day_plan_items only POINTS at tasks.id, and confirming a plan writes
-- scheduled_for on the real task rows, so work already sent to Today survives
-- the planner being removed entirely.
--
-- APPLY NOTE: safe to run against a live database. Every statement creates
-- something new, so no existing row is read, locked or rewritten.

CREATE TYPE "public"."planner_category_kind" AS ENUM('life_area', 'planner');--> statement-breakpoint
CREATE TABLE "day_plan_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day_plan_id" uuid NOT NULL,
	"kind" "planner_category_kind" NOT NULL,
	"life_area_id" uuid,
	"label" text NOT NULL,
	"minutes" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_plan_allocations_kind_matches_link" CHECK (("day_plan_allocations"."kind" = 'life_area') or ("day_plan_allocations"."kind" = 'planner' and "day_plan_allocations"."life_area_id" is null)),
	CONSTRAINT "day_plan_allocations_minutes_range" CHECK ("day_plan_allocations"."minutes" between 15 and 1440)
);
--> statement-breakpoint
CREATE TABLE "day_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day_plan_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"planned_minutes" smallint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_plan_items_plan_task_uq" UNIQUE("day_plan_id","task_id"),
	CONSTRAINT "day_plan_items_minutes_range" CHECK ("day_plan_items"."planned_minutes" between 5 and 1440)
);
--> statement-breakpoint
CREATE TABLE "day_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_plans_user_plan_date_uq" UNIQUE("user_id","plan_date")
);
--> statement-breakpoint
ALTER TABLE "day_plan_allocations" ADD CONSTRAINT "day_plan_allocations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_allocations" ADD CONSTRAINT "day_plan_allocations_day_plan_id_day_plans_id_fk" FOREIGN KEY ("day_plan_id") REFERENCES "public"."day_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_allocations" ADD CONSTRAINT "day_plan_allocations_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_day_plan_id_day_plans_id_fk" FOREIGN KEY ("day_plan_id") REFERENCES "public"."day_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_allocation_id_day_plan_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."day_plan_allocations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_plan_allocations_plan_idx" ON "day_plan_allocations" USING btree ("day_plan_id","sort_order");--> statement-breakpoint
CREATE INDEX "day_plan_allocations_user_idx" ON "day_plan_allocations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "day_plan_allocations_label_uq" ON "day_plan_allocations" USING btree ("day_plan_id",lower("label"));--> statement-breakpoint
CREATE UNIQUE INDEX "day_plan_allocations_life_area_uq" ON "day_plan_allocations" USING btree ("day_plan_id","life_area_id") WHERE "day_plan_allocations"."life_area_id" is not null;--> statement-breakpoint
CREATE INDEX "day_plan_items_allocation_idx" ON "day_plan_items" USING btree ("allocation_id","sort_order");--> statement-breakpoint
CREATE INDEX "day_plan_items_plan_idx" ON "day_plan_items" USING btree ("day_plan_id");--> statement-breakpoint
CREATE INDEX "day_plan_items_user_idx" ON "day_plan_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "day_plan_items_task_idx" ON "day_plan_items" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "day_plans_user_date_idx" ON "day_plans" USING btree ("user_id","plan_date");