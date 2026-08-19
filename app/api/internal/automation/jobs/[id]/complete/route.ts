import * as workerRepo from "@/db/repositories/worker";
import {
  authenticateAutomationWorker,
  workerErrorName,
  workerJson,
  workerUnauthorized,
} from "@/lib/automation/worker-auth";
import {
  completeWorkerJob,
  type CompleteWorkerInput,
  validateWorkerNotification,
} from "@/lib/automation/worker-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  let input: CompleteWorkerInput;
  if (record.outcome === "use_fallback" && Object.keys(record).length === 1) {
    input = { outcome: "use_fallback" };
  } else if (
    record.outcome === "deliver" &&
    Object.keys(record).every((key) => key === "outcome" || key === "notification")
  ) {
    const notification = validateWorkerNotification(record.notification);
    if (!notification) {
      return workerJson({ error: "Check the notification." }, { status: 422 });
    }
    input = { outcome: "deliver", notification };
  } else if (
    record.outcome === "acknowledge" &&
    Object.keys(record).every((key) => key === "outcome" || key === "taskIds")
  ) {
    // The workflow delivered this one itself, by email. Optional task ids are
    // stored so the next graveyard digest can count repeat appearances by id.
    const ids = record.taskIds;
    if (ids !== undefined) {
      if (
        !Array.isArray(ids) ||
        ids.length > 100 ||
        ids.some((id) => typeof id !== "string" || !UUID.test(id))
      ) {
        return workerJson({ error: "Check taskIds." }, { status: 422 });
      }
    }
    input = { outcome: "acknowledge", ...(ids ? { taskIds: ids as string[] } : {}) };
  } else {
    return workerJson({ error: "Check the request body." }, { status: 422 });
  }

  try {
    const job = await workerRepo.getLeasedJob(id, leaseId);
    if (!job) return workerJson({ error: "Job not found." }, { status: 404 });
    const result = await completeWorkerJob(job, leaseId, input);
    if (result.status === "conflict") {
      const status = result.reason === "invalid_notification" ? 422 : 409;
      return workerJson(result, { status });
    }
    return workerJson(result, { status: result.status === "retrying" ? 202 : 200 });
  } catch (error) {
    console.error("automation worker completion failed", { errorName: workerErrorName(error) });
    return workerJson({ error: "Automation worker is unavailable." }, { status: 500 });
  }
}
