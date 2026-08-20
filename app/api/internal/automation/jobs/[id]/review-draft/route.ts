import { reviewsRepo } from "@/db";
import * as workerRepo from "@/db/repositories/worker";
import {
  authenticateAutomationWorker,
  workerErrorName,
  workerJson,
  workerUnauthorized,
} from "@/lib/automation/worker-auth";
import { reviewDraftSchema } from "@/lib/validations/automation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DRAFT_PREFIX = "[AI draft] ";

const ALLOWED_FIELDS = new Set([
  "wins",
  "challenges",
  "nextWeekFocus",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!authenticateAutomationWorker(request)) return workerUnauthorized();

  const { id } = await context.params;
  const leaseId = request.headers.get("x-goha-job-lease")?.trim() ?? "";

  if (!UUID.test(id) || !UUID.test(leaseId)) {
    return workerJson({ error: "Job not found." }, { status: 404 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return workerJson({ error: "Send a valid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return workerJson({ error: "Check the request body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;

  if (Object.keys(record).some((key) => !ALLOWED_FIELDS.has(key))) {
    return workerJson(
      { error: "Only review draft fields are accepted." },
      { status: 422 },
    );
  }

  try {
    const job = await workerRepo.getLeasedJob(id, leaseId);

    if (!job) {
      return workerJson({ error: "Job not found." }, { status: 404 });
    }

    if (job.kind !== "review_draft") {
      return workerJson(
        { error: "This job cannot write a review draft." },
        { status: 409 },
      );
    }

    // The worker owns the week. n8n is never allowed to choose it.
    const weekStart = job.targetDate;

    if (!weekStart) {
      return workerJson(
        { error: "Review week is unavailable." },
        { status: 409 },
      );
    }

    const parsed = reviewDraftSchema.safeParse({
      weekStart,
      wins: record.wins,
      challenges: record.challenges,
      nextWeekFocus: record.nextWeekFocus,
    });

    if (!parsed.success) {
      return workerJson(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Check the review draft.",
        },
        { status: 422 },
      );
    }

    const requested = {
      wins: parsed.data.wins
        ? `${DRAFT_PREFIX}${parsed.data.wins.trim()}`
        : null,

      challenges: parsed.data.challenges
        ? `${DRAFT_PREFIX}${parsed.data.challenges.trim()}`
        : null,

      focusNextWeek: parsed.data.nextWeekFocus
        ? `${DRAFT_PREFIX}${parsed.data.nextWeekFocus.trim()}`
        : null,
    };

    const result = await reviewsRepo.fillEmptyReviewDraft(
      job.userId,
      parsed.data.weekStart,
      requested,
    );

    if (!result) {
      return workerJson(
        { error: "Review could not be written." },
        { status: 500 },
      );
    }

    const allFields = [
      "wins",
      "challenges",
      "focusNextWeek",
    ] as const;

    const written = result.written;
    const skipped = allFields.filter(
      (field) => !written.includes(field),
    );

    if (result.review.completedAt) {
      return workerJson({
        weekStart: parsed.data.weekStart,
        written: [],
        skipped: allFields,
        reason: "review_complete",
      });
    }

    return workerJson(
      {
        weekStart: parsed.data.weekStart,
        written,
        skipped,
      },
      { status: written.length > 0 ? 201 : 200 },
    );
  } catch (error) {
    console.error("automation worker review draft failed", {
      errorName: workerErrorName(error),
    });

    return workerJson(
      { error: "Automation worker is unavailable." },
      { status: 500 },
    );
  }
}