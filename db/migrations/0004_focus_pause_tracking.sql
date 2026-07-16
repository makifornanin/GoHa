ALTER TABLE "focus_sessions" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD COLUMN "paused_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "focus_sessions_user_status_idx" ON "focus_sessions" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_paused_seconds_non_negative" CHECK ("focus_sessions"."paused_seconds" >= 0);