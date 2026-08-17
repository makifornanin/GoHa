ALTER TABLE "daily_quotes" ADD COLUMN "pinned_for" date;--> statement-breakpoint
ALTER TABLE "daily_quotes" ADD CONSTRAINT "daily_quotes_pinned_for_uq" UNIQUE("pinned_for");