import * as workerRepo from "@/db/repositories/worker";
import {
  authenticateAutomationWorker,
  workerErrorName,
  workerJson,
  workerUnauthorized,
} from "@/lib/automation/worker-auth";
import { prepareWorkerJob } from "@/lib/automation/worker-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!authenticateAutomationWorker(request)) return workerUnauthorized();
  const { id } = await context.params;
  const leaseId = request.headers.get("x-goha-job-lease")?.trim() ?? "";
  if (!UUID.test(id) || !UUID.test(leaseId)) {
    return workerJson({ error: "Job not found." }, { status: 404 });
  }

  try {
    const job = await workerRepo.getLeasedJob(id, leaseId);
    if (!job) return workerJson({ error: "Job not found." }, { status: 404 });
    const prepared = await prepareWorkerJob(job);
    if (prepared.state === "skip") {
      const skipped = await workerRepo.skipUndeliveredJob(
        job.id,
        leaseId,
        prepared.reason,
        new Date(),
      );
      if (!skipped) return workerJson({ error: "Job state changed." }, { status: 409 });
      return workerJson({
        job: { id: job.id, kind: job.kind },
        action: "skip",
        reason: prepared.reason,
      });
    }
    return workerJson({
      job: {
        id: job.id,
        kind: job.kind,
        localDate: job.localDate,
        timezone: job.timezone,
        dedupeKey: job.dedupeKey,
        payloadVersion: job.payloadVersion,
      },
      action: "process",
      payload: prepared.payload,
      ...(prepared.delivery ? { delivery: prepared.delivery } : {}),
      fallbackNotification: prepared.fallbackNotification,
    });
  } catch (error) {
    console.error("automation worker payload failed", { errorName: workerErrorName(error) });
    return workerJson({ error: "Automation worker is unavailable." }, { status: 500 });
  }
}
