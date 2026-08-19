import { describe, expect, it } from "vitest";

import { workerDeliveryDisposition } from "@/lib/automation/worker-delivery";

describe("worker multi-device completion", () => {
  it("retries a partial delivery because accepted devices are ledger-protected", () => {
    expect(
      workerDeliveryDisposition(
        { attempted: 2, succeeded: 1, permanentFailures: 0, transientFailures: 1 },
        true,
      ),
    ).toEqual({ action: "retry", reason: "transient_push_failure" });
  });

  it("completes only when at least one device succeeded and none remain transient", () => {
    expect(
      workerDeliveryDisposition(
        { attempted: 2, succeeded: 1, permanentFailures: 1, transientFailures: 0 },
        true,
      ),
    ).toEqual({ action: "complete" });
  });

  it("fails after retry exhaustion even if one device previously succeeded", () => {
    expect(
      workerDeliveryDisposition(
        { attempted: 1, succeeded: 1, permanentFailures: 0, transientFailures: 1 },
        false,
      ),
    ).toEqual({ action: "fail", reason: "push_attempts_exhausted" });
  });

  it("distinguishes no subscriptions from permanent-only device loss", () => {
    expect(
      workerDeliveryDisposition(
        { attempted: 0, succeeded: 0, permanentFailures: 0, transientFailures: 0 },
        true,
      ),
    ).toEqual({ action: "skip", reason: "no_active_subscriptions" });
    expect(
      workerDeliveryDisposition(
        { attempted: 1, succeeded: 0, permanentFailures: 1, transientFailures: 0 },
        true,
      ),
    ).toEqual({ action: "skip", reason: "no_reachable_devices" });
  });
});
