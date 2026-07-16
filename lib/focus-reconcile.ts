import "server-only";

import { focusRepo } from "@/db";
import {
  countedFocusSeconds,
  focusElapsedSeconds,
  isStaleFocusSession,
  resolvePausedSeconds,
} from "@/lib/focus";

/**
 * Close out any running session that has been open past the abandon threshold so
 * it never stays in_progress forever. The counted duration is derived from
 * timestamps and capped by the plan (see lib/focus), then the row is marked
 * `abandoned`. Called on Focus page load; idempotent and user-scoped.
 */
export async function reconcileStaleFocusSessions(userId: string): Promise<void> {
  const sessions = await focusRepo.listInProgressSessions(userId);
  const now = new Date();

  for (const session of sessions) {
    if (!isStaleFocusSession(session.startedAt, now)) continue;

    const pausedSeconds = session.pausedAt
      ? resolvePausedSeconds(session.pausedSeconds, session.pausedAt, now)
      : session.pausedSeconds;
    const raw = focusElapsedSeconds(
      { startedAt: session.startedAt, endedAt: null, pausedSeconds, pausedAt: null },
      now,
    );

    await focusRepo.finishFocusSession(userId, session.id, {
      status: "abandoned",
      endedAt: now,
      durationSeconds: countedFocusSeconds(raw, session.plannedDurationSeconds),
      pausedSeconds,
    });
  }
}
