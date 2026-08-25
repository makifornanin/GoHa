ALTER TABLE "user_settings" ADD COLUMN "welcome_email_sent_at" timestamp with time zone;--> statement-breakpoint
-- Existing accounts are not new users.
--
-- `onboarding_completed_at` has been on this table since 0000 but was never
-- read or written, so every row still holds NULL. The first-login onboarding
-- added in this change treats NULL as "has not seen it", which without this
-- backfill would greet every established account with a welcome tour on their
-- next visit.
--
-- Marking them complete NOW is the safe default and the reversible one: an
-- owner who wants to see the tour can clear their own row, whereas an
-- unwanted popup shown to everyone cannot be un-shown. Rows created after this
-- migration keep NULL and get the onboarding, which is the intended behaviour
-- for genuinely new accounts.
UPDATE "user_settings" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;--> statement-breakpoint
-- Established accounts must not receive a welcome email either. The column is
-- new, so every existing row is NULL, and the claim that guards sending reads
-- NULL as "not yet welcomed".
UPDATE "user_settings" SET "welcome_email_sent_at" = now() WHERE "welcome_email_sent_at" IS NULL;
