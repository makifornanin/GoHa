import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getLeasedJob: vi.fn(),
  skipJob: vi.fn(),
  skipUndeliveredJob: vi.fn(),
  materializeAndClaimJobs: vi.fn(),
  prepareWorkerJob: vi.fn(),
  completeWorkerJob: vi.fn(),
  failWorkerJob: vi.fn(),
}));

vi.mock("@/db/repositories/worker", () => ({
  getLeasedJob: mocks.getLeasedJob,
  skipJob: mocks.skipJob,
  skipUndeliveredJob: mocks.skipUndeliveredJob,
}));

vi.mock("@/lib/automation/worker-jobs", async () => {
  const notification = await import("@/lib/automation/worker-notification");
  return {
    WORKER_CLAIM_LIMIT_MAX: 25,
    materializeAndClaimJobs: mocks.materializeAndClaimJobs,
    prepareWorkerJob: mocks.prepareWorkerJob,
    completeWorkerJob: mocks.completeWorkerJob,
    failWorkerJob: mocks.failWorkerJob,
    validateWorkerNotification: notification.validateWorkerNotification,
  };
});

import { POST as claimJobs } from "@/app/api/internal/automation/jobs/claim/route";
import { GET as getJob } from "@/app/api/internal/automation/jobs/[id]/route";
import { POST as completeJob } from "@/app/api/internal/automation/jobs/[id]/complete/route";

const SECRET = `worker_${"s".repeat(48)}`;
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const LEASE_ID = "22222222-2222-4222-8222-222222222222";

function workerRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "X-GoHa-Job-Lease": LEASE_ID,
      ...(init.headers ?? {}),
    },
  });
}

describe("internal automation worker routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTOMATION_WORKER_SECRET = SECRET;
  });

  it("returns the uniform unauthorized response before touching the queue", async () => {
    const response = await claimJobs(
      new Request("https://goha.test/api/internal/automation/jobs/claim", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(mocks.materializeAndClaimJobs).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied identity fields on claim", async () => {
    const response = await claimJobs(
      workerRequest("https://goha.test/api/internal/automation/jobs/claim", {
        method: "POST",
        body: JSON.stringify({ limit: 10, userId: "someone-else" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.materializeAndClaimJobs).not.toHaveBeenCalled();
  });

  it("rejects an oversized claim body before JSON parsing", async () => {
    const response = await claimJobs(
      workerRequest("https://goha.test/api/internal/automation/jobs/claim", {
        method: "POST",
        body: "x".repeat(1_025),
      }),
    );
    expect(response.status).toBe(413);
    expect(mocks.materializeAndClaimJobs).not.toHaveBeenCalled();
  });

  it("claims a bounded batch without exposing its user identity", async () => {
    mocks.materializeAndClaimJobs.mockResolvedValue([
      {
        id: JOB_ID,
        userId: "server-owned-user",
        kind: "morning_brief",
        leaseId: LEASE_ID,
        leaseExpiresAt: new Date("2026-08-18T00:15:00.000Z"),
      },
    ]);
    const response = await claimJobs(
      workerRequest("https://goha.test/api/internal/automation/jobs/claim", {
        method: "POST",
        body: JSON.stringify({ limit: 1 }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.materializeAndClaimJobs).toHaveBeenCalledWith(1);
    const body = await response.json();
    expect(body.jobs[0]).toEqual({
      id: JOB_ID,
      kind: "morning_brief",
      leaseId: LEASE_ID,
      leaseExpiresAt: "2026-08-18T00:15:00.000Z",
    });
    expect(body.jobs[0]).not.toHaveProperty("userId");
  });

  it("binds payload lookup to the route job id and that job's lease", async () => {
    const job = {
      id: JOB_ID,
      userId: "server-owned-user",
      kind: "morning_brief",
      localDate: "2026-08-18",
      timezone: "Asia/Manila",
      dedupeKey: "brief:morning:2026-08-18",
      payloadVersion: 1,
    };
    mocks.getLeasedJob.mockResolvedValue(job);
    mocks.prepareWorkerJob.mockResolvedValue({
      state: "ready",
      job,
      payload: { recommendation: "Start here." },
      fallbackNotification: { title: "GoHa", body: "Start here.", url: "/today" },
    });

    const response = await getJob(workerRequest(`https://goha.test/job/${JOB_ID}`), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    expect(response.status).toBe(200);
    expect(mocks.getLeasedJob).toHaveBeenCalledWith(JOB_ID, LEASE_ID);
    const body = await response.json();
    expect(body.job).not.toHaveProperty("userId");
    expect(body.action).toBe("process");
  });

  it("does not accept user/date/key overrides during completion", async () => {
    const response = await completeJob(
      workerRequest(`https://goha.test/job/${JOB_ID}/complete`, {
        method: "POST",
        body: JSON.stringify({
          outcome: "use_fallback",
          userId: "someone-else",
          localDate: "2030-01-01",
          dedupeKey: "forged",
        }),
      }),
      { params: Promise.resolve({ id: JOB_ID }) },
    );
    expect(response.status).toBe(422);
    expect(mocks.getLeasedJob).not.toHaveBeenCalled();
    expect(mocks.completeWorkerJob).not.toHaveBeenCalled();
  });
});
