export type WorkerDeliveryCounts = {
  attempted: number;
  succeeded: number;
  permanentFailures: number;
  transientFailures: number;
};

export type WorkerDeliveryDisposition =
  | { action: "complete" }
  | { action: "retry"; reason: "transient_push_failure" }
  | { action: "fail"; reason: "push_attempts_exhausted" }
  | { action: "skip"; reason: "no_active_subscriptions" | "no_reachable_devices" };

/**
 * A partial multi-device send is not complete while a retryable endpoint is
 * outstanding. The per-device ledger makes that retry safe by skipping every
 * endpoint already accepted by its provider.
 */
export function workerDeliveryDisposition(
  counts: WorkerDeliveryCounts,
  canRetry: boolean,
): WorkerDeliveryDisposition {
  if (counts.transientFailures > 0) {
    return canRetry
      ? { action: "retry", reason: "transient_push_failure" }
      : { action: "fail", reason: "push_attempts_exhausted" };
  }
  if (counts.succeeded > 0) return { action: "complete" };
  if (counts.attempted === 0) return { action: "skip", reason: "no_active_subscriptions" };
  return { action: "skip", reason: "no_reachable_devices" };
}
