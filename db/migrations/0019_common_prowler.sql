CREATE TYPE "public"."inspiration_type" AS ENUM('quote', 'bible_verse');--> statement-breakpoint
CREATE TABLE "daily_inspirations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"type" "inspiration_type" NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"translation" text,
	"provider" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_inspirations_user_local_date_uq" UNIQUE("user_id","local_date")
);
--> statement-breakpoint
ALTER TABLE "daily_inspirations" ADD CONSTRAINT "daily_inspirations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_inspirations_user_date_idx" ON "daily_inspirations" USING btree ("user_id","local_date");