-- Takeaways: a reader's own note on the day's inspiration.
--
-- ROLLBACK CHARACTERISTICS: fully additive and cleanly reversible. One new
-- table; nothing existing is altered, renamed or dropped, so an app built
-- before this migration runs unchanged against a database that has it.
--
-- TO ROLL BACK:  DROP TABLE inspiration_takeaways;
--
-- That discards what people have written, which is user content and not
-- recoverable, so it should only ever happen on a database that has never had
-- the feature enabled. Nothing else is affected: daily_inspirations is
-- untouched by this migration and by the feature, which is exactly why the
-- takeaway lives in its own table rather than as a mutable column on a row the
-- morning notification is built from.
--
-- APPLY NOTE: safe to run against a live database. Every statement creates
-- something new, so no existing row is read, locked or rewritten.

CREATE TABLE "inspiration_takeaways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"inspiration_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspiration_takeaways_user_local_date_uq" UNIQUE("user_id","local_date"),
	CONSTRAINT "inspiration_takeaways_body_not_blank" CHECK (length(btrim("inspiration_takeaways"."body")) > 0)
);
--> statement-breakpoint
ALTER TABLE "inspiration_takeaways" ADD CONSTRAINT "inspiration_takeaways_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspiration_takeaways" ADD CONSTRAINT "inspiration_takeaways_inspiration_id_daily_inspirations_id_fk" FOREIGN KEY ("inspiration_id") REFERENCES "public"."daily_inspirations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspiration_takeaways_user_date_idx" ON "inspiration_takeaways" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "inspiration_takeaways_inspiration_idx" ON "inspiration_takeaways" USING btree ("inspiration_id");