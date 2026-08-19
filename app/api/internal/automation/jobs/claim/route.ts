import {
  authenticateAutomationWorker,
  workerErrorName,
  workerJson,
  workerUnauthorized,
} from "@/lib/automation/worker-auth";
import {
  materializeAndClaimJobs,
  WORKER_CLAIM_LIMIT_MAX,
} from "@/lib/automation/worker-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLAIM_BODY_MAX_BYTES = 1_024;

async function readClaimBody(request: Request): Promise<string | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > CLAIM_BODY_MAX_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > CLAIM_BODY_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: Request): Promise<Response> {
  if (!authenticateAutomationWorker(request)) return workerUnauthorized();

  let limit = 10;
  let text: string | null;
  try {
    text = await readClaimBody(request);
  } catch {
    return workerJson({ error: "Could not read the request body." }, { status: 400 });
  }
  if (text === null) {
    return workerJson({ error: "Request body is too large." }, { status: 413 });
  }
  if (text.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return workerJson({ error: "Send a valid JSON body." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return workerJson({ error: "Check the request body." }, { status: 400 });
    }
    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "limit")) {
      return workerJson({ error: "Check the request body." }, { status: 400 });
    }
    if (record.limit !== undefined) {
      if (!Number.isInteger(record.limit) || Number(record.limit) < 1 || Number(record.limit) > WORKER_CLAIM_LIMIT_MAX) {
        return workerJson(
          { error: `limit must be an integer from 1 to ${WORKER_CLAIM_LIMIT_MAX}.` },
          { status: 422 },
        );
      }
      limit = Number(record.limit);
    }
  }

  try {
    const jobs = await materializeAndClaimJobs(limit);
    return workerJson({
      jobs: jobs.map((job) => ({
        id: job.id,
        kind: job.kind,
        leaseId: job.leaseId,
        leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
      })),
      pollAfterSeconds: 300,
    });
  } catch (error) {
    console.error("automation worker claim failed", { errorName: workerErrorName(error) });
    return workerJson({ error: "Automation worker is unavailable." }, { status: 500 });
  }
}
