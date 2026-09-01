CREATE TABLE "planner_default_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "planner_category_kind" NOT NULL,
	"life_area_id" uuid,
	"label" text NOT NULL,
	"minutes" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"color" text,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planner_default_categories_kind_matches_link" CHECK (("planner_default_categories"."kind" = 'life_area') or ("planner_default_categories"."kind" = 'planner' and "planner_default_categories"."life_area_id" is null)),
	CONSTRAINT "planner_default_categories_minutes_range" CHECK ("planner_default_categories"."minutes" between 15 and 1440)
);
--> statement-breakpoint
ALTER TABLE "day_plan_items" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "day_plan_allocations" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "day_plan_allocations" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD COLUMN "actual_minutes" smallint;--> statement-breakpoint
ALTER TABLE "planner_default_categories" ADD CONSTRAINT "planner_default_categories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_default_categories" ADD CONSTRAINT "planner_default_categories_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planner_default_categories_user_idx" ON "planner_default_categories" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "planner_default_categories_label_uq" ON "planner_default_categories" USING btree ("user_id",lower("label"));--> statement-breakpoint
CREATE UNIQUE INDEX "planner_default_categories_life_area_uq" ON "planner_default_categories" USING btree ("user_id","life_area_id") WHERE "planner_default_categories"."life_area_id" is not null;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_task_or_label" CHECK (("day_plan_items"."task_id" is not null and "day_plan_items"."label" is null) or ("day_plan_items"."task_id" is null and "day_plan_items"."label" is not null));--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_actual_manual_only" CHECK ("day_plan_items"."actual_minutes" is null or "day_plan_items"."task_id" is null);--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_actual_range" CHECK ("day_plan_items"."actual_minutes" is null or "day_plan_items"."actual_minutes" between 0 and 1440);