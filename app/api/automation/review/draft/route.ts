import { reviewsRepo } from "@/db";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  finishAutomation,
  isFailure,
} from "@/lib/automation/request";
import { startOfWeek, type Weekday } from "@/lib/date";
import { reviewDraftSchema } from "@/lib/validations/automation";

const ROUTE = "POST /api/automation/review/draft";

export const dynamic = "force-dynamic";

/** Visible authorship: the owner can see at a glance what they did not write. */
const DRAFT_PREFIX = "[AI draft] ";

/**
 * Write a drafted reflection into the week's review (automation Guide 06).
 *
 * The one endpoint that writes the owner's own words, so the rules are strict
 * and enforced HERE rather than trusted to the workflow:
 *
 *  - only into fields that are currently EMPTY; a field with anything in it is
 *    the owner's and is never touched
 *  - never `completedAt`, never `rating`; finishing a review and scoring the
 *    week are judgements a draft has no business making
 *  - every drafted field is prefixed, so authorship is visible in the UI
 *  - a completed review is skipped entirely
 *
 * The response says which fields were written and which were skipped, so the
 * workflow can log what it actually did rather than what it attempted.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE, scope: "read_write" });
  if (isFailure(auth)) return auth.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson({ error: "Send a JSON body." }, { status: 400 }),
      );
    }

    const parsed = reviewDraftSchema.safeParse(body);
    if (!parsed.success) {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson(
          { error: parsed.error.issues[0]?.message ?? "Check the request body." },
          { status: 422 },
        ),
      );
    }

    // The posted week must BE a week boundary for this owner's week start.
    // `weekly_reviews` is unique on (user_id, week_start), so a mid-week date
    // would quietly create a second review for the same seven days.
    const weekStartsOn = (auth.settings.weekStartsOn as Weekday) ?? 1;
    const { weekStart } = parsed.data;
    if (startOfWeek(weekStart, weekStartsOn) !== weekStart) {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson(
          { error: "weekStart must be the first day of a week for this account." },
          { status: 422 },
        ),
      );
    }

    const existing = await reviewsRepo.getWeeklyReview(auth.userId, weekStart);
    if (existing?.completedAt) {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson({
          weekStart,
          written: [],
          skipped: ["wins", "challenges", "focusNextWeek"],
          reason: "That week's review is already complete.",
        }),
      );
    }

    const written: string[] = [];
    const skipped: string[] = [];
    const updates: Record<string, string> = {};

    const consider = (field: "wins" | "challenges" | "focusNextWeek", value?: string | null) => {
      const current = existing?.[field];
      if (current && current.trim().length > 0) {
        skipped.push(field);
        return;
      }
      if (!value || value.trim().length === 0) {
        skipped.push(field);
        return;
      }
      updates[field] = `${DRAFT_PREFIX}${value.trim()}`;
      written.push(field);
    };

    consider("wins", parsed.data.wins);
    consider("challenges", parsed.data.challenges);
    // The guide calls this nextWeekFocus; the column has always been
    // focusNextWeek. Mapped here so the published contract stays the guide's.
    consider("focusNextWeek", parsed.data.nextWeekFocus);

    if (written.length > 0) {
      await reviewsRepo.upsertWeeklyReview(auth.userId, weekStart, updates);
    }

    return await finishAutomation(
      auth,
      ROUTE,
      automationJson({ weekStart, written, skipped }, { status: written.length > 0 ? 201 : 200 }),
    );
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
