import { create } from "zustand";

import type { FocusSession } from "@/db";

/**
 * Client store for the ACTIVE focus timer interaction only (CLAUDE.md section 3:
 * Zustand solely for the focus timer). It mirrors the server's in-progress
 * session and ticks a clock for display. It is NOT the source of truth: every
 * transition round-trips to a Server Action and the returned row replaces this
 * state. Elapsed time is always derived from the session's timestamps, never
 * from a decrementing counter, so a slept tab or a reload recovers correctly.
 */
type FocusTimerState = {
  session: FocusSession | null;
  /** Current wall-clock ms, advanced by the ticking effect while running. */
  nowMs: number;
  setSession: (session: FocusSession | null) => void;
  tick: () => void;
};

export const useFocusTimer = create<FocusTimerState>((set) => ({
  session: null,
  nowMs: Date.now(),
  setSession: (session) => set({ session, nowMs: Date.now() }),
  tick: () => set({ nowMs: Date.now() }),
}));
