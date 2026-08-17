CREATE TYPE "public"."signup_mode" AS ENUM('open', 'invite_only');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_mode" "signup_mode" DEFAULT 'invite_only' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_quotes" DROP CONSTRAINT "daily_quotes_source_text_uq";--> statement-breakpoint
ALTER TABLE "daily_quotes" DROP CONSTRAINT "daily_quotes_pinned_for_uq";--> statement-breakpoint
ALTER TABLE "daily_quotes" ADD COLUMN "user_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "app_settings_singleton_uq" ON "app_settings" USING btree (((true)));--> statement-breakpoint
ALTER TABLE "daily_quotes" ADD CONSTRAINT "daily_quotes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_quotes_shared_source_text_uq" ON "daily_quotes" USING btree ("source","text") WHERE "daily_quotes"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_quotes_user_pinned_for_uq" ON "daily_quotes" USING btree ("user_id","pinned_for") WHERE "daily_quotes"."pinned_for" is not null;--> statement-breakpoint
CREATE INDEX "daily_quotes_user_idx" ON "daily_quotes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "daily_quotes" ADD CONSTRAINT "daily_quotes_user_source_text_uq" UNIQUE("user_id","source","text");