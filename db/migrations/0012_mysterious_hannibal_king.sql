CREATE TYPE "public"."automation_scope" AS ENUM('read', 'read_write');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('morning_brief', 'evening_summary', 'deadline', 'focus_overrun', 'streak_risk', 'graveyard', 'review_draft', 'health', 'sabbath');--> statement-breakpoint
CREATE TYPE "public"."quote_source" AS ENUM('quote', 'verse');--> statement-breakpoint
CREATE TYPE "public"."quote_source_pref" AS ENUM('quote', 'verse', 'both');--> statement-breakpoint
CREATE TABLE "automation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_id" uuid,
	"route" text NOT NULL,
	"status" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scope" "automation_scope" DEFAULT 'read' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_tokens_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "daily_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "quote_source" NOT NULL,
	"text" text NOT NULL,
	"attribution" text,
	"translation" text,
	"theme" text,
	"active" boolean DEFAULT true NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_quotes_source_text_uq" UNIQUE("source","text")
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"dedupe_key" text NOT NULL,
	"local_date" date NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"payload" jsonb,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_log_user_dedupe_key_uq" UNIQUE("user_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "morning_brief_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "evening_summary_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "deadline_alerts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "deadline_lead_minutes" smallint DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "quote_source_pref" "quote_source_pref" DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "sabbath_day" smallint;--> statement-breakpoint
ALTER TABLE "automation_requests" ADD CONSTRAINT "automation_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_requests" ADD CONSTRAINT "automation_requests_token_id_automation_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."automation_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_tokens" ADD CONSTRAINT "automation_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_requests_user_created_idx" ON "automation_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_requests_token_created_idx" ON "automation_requests" USING btree ("token_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_tokens_prefix_idx" ON "automation_tokens" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX "automation_tokens_user_id_idx" ON "automation_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "daily_quotes_active_theme_idx" ON "daily_quotes" USING btree ("active","theme");--> statement-breakpoint
CREATE INDEX "notification_log_user_kind_date_idx" ON "notification_log" USING btree ("user_id","kind","local_date");--> statement-breakpoint
CREATE INDEX "notification_log_user_sent_idx" ON "notification_log" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "tasks_user_in_progress_idx" ON "tasks" USING btree ("user_id","status") WHERE "tasks"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "tasks_user_open_due_idx" ON "tasks" USING btree ("user_id","due_at") WHERE "tasks"."completed_at" is null;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_sabbath_day_range" CHECK ("user_settings"."sabbath_day" is null or ("user_settings"."sabbath_day" between 0 and 6));--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_deadline_lead_range" CHECK ("user_settings"."deadline_lead_minutes" between 5 and 1440);