import * as workerRepo from "@/db/repositories/worker";
import {
  authenticateAutomationWorker,
  workerErrorName,
  workerJson,
  workerUnauthorized,
} from "@/lib/automation/worker-auth";
import { failWorkerJob } from "@/lib/automation/worker-jobs";

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
  if (
    Object.keys(record).some((key) => key !== "code") ||
    typeof record.code !== "string" ||
    !/^[a-z0-9][a-z0-9_:-]{0,63}$/.test(record.code)
  ) {
    return workerJson({ error: "Check the failure code." }, { status: 422 });
  }

  try {
    const job = await workerRepo.getLeasedJob(id, leaseId);
    if (!job) return workerJson({ error: "Job not found." }, { status: 404 });
    const result = await failWorkerJob(job, leaseId, record.code);
    if (result.status === "conflict") return workerJson(result, { status: 409 });
    return workerJson(result, { status: result.status === "retrying" ? 202 : 200 });
  } catch (error) {
    console.error("automation worker failure handling failed", {
      errorName: workerErrorName(error),
    });
    return workerJson({ error: "Automation worker is unavailable." }, { status: 500 });
  }
}
