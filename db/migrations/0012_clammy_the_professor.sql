CREATE TYPE "public"."automation_scope" AS ENUM('read', 'read_write');--> statement-breakpoint
CREATE TABLE "automation_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"delivery_date" date NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_deliveries_user_kind_date_uq" UNIQUE("user_id","kind","delivery_date")
);
--> statement-breakpoint
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
ALTER TABLE "automation_deliveries" ADD CONSTRAINT "automation_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_requests" ADD CONSTRAINT "automation_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_requests" ADD CONSTRAINT "automation_requests_token_id_automation_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."automation_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_tokens" ADD CONSTRAINT "automation_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_deliveries_user_created_idx" ON "automation_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_requests_user_created_idx" ON "automation_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_requests_token_created_idx" ON "automation_requests" USING btree ("token_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_tokens_prefix_idx" ON "automation_tokens" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX "automation_tokens_user_id_idx" ON "automation_tokens" USING btree ("user_id");