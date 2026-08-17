CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invited_by" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"code_prefix" text NOT NULL,
	"email" text,
	"label" text,
	"expires_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_code_hash_uq" UNIQUE("code_hash")
);
--> statement-breakpoint
DROP INDEX "user_single_owner_uq";--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_code_prefix_idx" ON "invites" USING btree ("code_prefix");--> statement-breakpoint
CREATE INDEX "invites_invited_by_idx" ON "invites" USING btree ("invited_by");