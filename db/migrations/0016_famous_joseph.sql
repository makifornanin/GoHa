CREATE TYPE "public"."automation_job_status" AS ENUM('pending', 'leased', 'completed', 'skipped', 'failed');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'test';--> statement-breakpoint
CREATE TABLE "push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"subscription_id" uuid,
	"subscription_endpoint_hash" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone NOT NULL,
	"attempt_token" uuid,
	"attempt_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"permanent_failure_at" timestamp with time zone,
	"last_status_code" smallint,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_deliveries_notification_endpoint_uq" UNIQUE("notification_id","subscription_endpoint_hash"),
	CONSTRAINT "push_deliveries_endpoint_hash_shape" CHECK (char_length("push_deliveries"."subscription_endpoint_hash") = 64 and "push_deliveries"."subscription_endpoint_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "push_deliveries_attempt_count_nonnegative" CHECK ("push_deliveries"."attempt_count" >= 0),
	CONSTRAINT "push_deliveries_lease_pair" CHECK (("push_deliveries"."attempt_token" is null) = ("push_deliveries"."attempt_expires_at" is null)),
	CONSTRAINT "push_deliveries_terminal_state" CHECK (not ("push_deliveries"."accepted_at" is not null and "push_deliveries"."permanent_failure_at" is not null)),
	CONSTRAINT "push_deliveries_terminal_has_no_lease" CHECK (("push_deliveries"."accepted_at" is null and "push_deliveries"."permanent_failure_at" is null) or ("push_deliveries"."attempt_token" is null and "push_deliveries"."attempt_expires_at" is null)),
	CONSTRAINT "push_deliveries_status_code_range" CHECK ("push_deliveries"."last_status_code" is null or "push_deliveries"."last_status_code" between 100 and 599),
	CONSTRAINT "push_deliveries_error_code_length" CHECK ("push_deliveries"."last_error_code" is null or char_length("push_deliveries"."last_error_code") <= 64)
);
--> statement-breakpoint
CREATE TABLE "push_pairing_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"secret_prefix" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_pairing_sessions_user_id_uq" UNIQUE("user_id"),
	CONSTRAINT "push_pairing_sessions_secret_hash_uq" UNIQUE("secret_hash"),
	CONSTRAINT "push_pairing_sessions_hash_shape" CHECK (char_length("push_pairing_sessions"."secret_hash") = 64 and "push_pairing_sessions"."secret_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "push_pairing_sessions_prefix_length" CHECK (char_length("push_pairing_sessions"."secret_prefix") between 10 and 20),
	CONSTRAINT "push_pairing_sessions_lifetime" CHECK ("push_pairing_sessions"."expires_at" > "push_pairing_sessions"."issued_at" and "push_pairing_sessions"."expires_at" <= "push_pairing_sessions"."issued_at" + interval '15 minutes'),
	CONSTRAINT "push_pairing_sessions_consumed_after_issue" CHECK ("push_pairing_sessions"."consumed_at" is null or "push_pairing_sessions"."consumed_at" >= "push_pairing_sessions"."issued_at")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"expiration_time" timestamp with time zone,
	"device_label" text,
	"disabled_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_uq" UNIQUE("endpoint"),
	CONSTRAINT "push_subscriptions_endpoint_shape" CHECK (char_length("push_subscriptions"."endpoint") between 9 and 2048 and "push_subscriptions"."endpoint" ~ '^https://'),
	CONSTRAINT "push_subscriptions_p256dh_shape" CHECK (char_length("push_subscriptions"."p256dh") between 80 and 128 and "push_subscriptions"."p256dh" ~ '^[A-Za-z0-9_-]+={0,2}$'),
	CONSTRAINT "push_subscriptions_auth_shape" CHECK (char_length("push_subscriptions"."auth") between 16 and 64 and "push_subscriptions"."auth" ~ '^[A-Za-z0-9_-]+={0,2}$'),
	CONSTRAINT "push_subscriptions_device_label_length" CHECK ("push_subscriptions"."device_label" is null or char_length("push_subscriptions"."device_label") <= 80),
	CONSTRAINT "push_subscriptions_failure_count_nonnegative" CHECK ("push_subscriptions"."failure_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "automation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"dedupe_key" text NOT NULL,
	"local_date" date NOT NULL,
	"target_date" date,
	"timezone" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"scheduled_for" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"status" "automation_job_status" DEFAULT 'pending' NOT NULL,
	"lease_id" uuid,
	"leased_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"delivery_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error_code" text,
	"payload_version" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_jobs_user_dedupe_uq" UNIQUE("user_id","dedupe_key"),
	CONSTRAINT "automation_jobs_attempt_count_nonnegative" CHECK ("automation_jobs"."attempt_count" >= 0),
	CONSTRAINT "automation_jobs_lease_state" CHECK ((
        "automation_jobs"."status" = 'leased'
        and "automation_jobs"."lease_id" is not null
        and "automation_jobs"."leased_at" is not null
        and "automation_jobs"."lease_expires_at" is not null
        and "automation_jobs"."lease_expires_at" > "automation_jobs"."leased_at"
      ) or (
        "automation_jobs"."status" <> 'leased'
        and "automation_jobs"."lease_id" is null
        and "automation_jobs"."leased_at" is null
        and "automation_jobs"."lease_expires_at" is null
      )),
	CONSTRAINT "automation_jobs_completion_state" CHECK (("automation_jobs"."status" in ('completed', 'skipped', 'failed')) = ("automation_jobs"."completed_at" is not null)),
	CONSTRAINT "automation_jobs_pending_not_started" CHECK ("automation_jobs"."status" <> 'pending' or "automation_jobs"."delivery_started_at" is null)
);
--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notification_id_notification_log_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_pairing_sessions" ADD CONSTRAINT "push_pairing_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_deliveries_user_notification_idx" ON "push_deliveries" USING btree ("user_id","notification_id");--> statement-breakpoint
CREATE INDEX "push_deliveries_subscription_idx" ON "push_deliveries" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "push_deliveries_retryable_idx" ON "push_deliveries" USING btree ("user_id","attempt_expires_at") WHERE "push_deliveries"."accepted_at" is null and "push_deliveries"."permanent_failure_at" is null;--> statement-breakpoint
CREATE INDEX "push_pairing_sessions_expires_at_idx" ON "push_pairing_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_active_user_idx" ON "push_subscriptions" USING btree ("user_id") WHERE "push_subscriptions"."disabled_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_jobs_lease_id_uq" ON "automation_jobs" USING btree ("lease_id") WHERE "automation_jobs"."lease_id" is not null;--> statement-breakpoint
CREATE INDEX "automation_jobs_status_available_idx" ON "automation_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "automation_jobs_user_kind_date_idx" ON "automation_jobs" USING btree ("user_id","kind","local_date");