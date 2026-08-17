import { describe, expect, it } from "vitest";

import { entryOutcome, type EntryLike, type HabitLike, type StreakOutcome } from "@/lib/habit-streaks";
import { loggedEntryOutcome, toDayCellState } from "@/lib/habit-outcome";

/**
 * Parity between the shared outcome function and the behaviour it replaced
 * (audit R-06).
 *
 * `legacyEntryOutcome` below is a FROZEN, verbatim copy of the implementation
 * that lived in lib/habit-streaks.ts before this refactor. It is duplicated here
 * on purpose: pointing the test at the live `entryOutcome` after that function
 * became a thin wrapper would make it compare the new code against itself and
 * assert nothing.
 *
 * As written, this pins the new definition against the historical one across
 * the whole input space. If someone later changes what `partial` means, or flips
 * a comparison, this fails and names the exact combination that moved.
 *
 * The one intentional difference is scope: the legacy function only ever saw a
 * logged entry, so this compares the logged path only. The unlogged rules
 * (pending / missed / off_schedule) came from resolveDayState and are covered in
 * tests/habit-outcome.test.ts.
 */
function legacyEntryOutcome(habit: HabitLike, entry: EntryLike): StreakOutcome {
  if (entry.status === "skipped") return "skip";
  if (entry.status === "missed") return "miss";
  // status === "done"
  if (habit.type === "numeric" && habit.targetValue != null && entry.value != null) {
    const met = habit.higherIsBetter
      ? entry.value >= habit.targetValue
      : entry.value <= habit.targetValue;
    return met ? "done" : "partial";
  }
  return "done";
}

/** Every habit shape that can reach the outcome logic. */
const HABITS: { label: string; habit: HabitLike }[] = [
  { label: "boolean", habit: { type: "boolean", targetValue: null, higherIsBetter: true } },
  // A boolean habit should never carry a target, but the type permits it and a
  // stray value must not change the answer.
  { label: "boolean with stray target", habit: { type: "boolean", targetValue: 5, higherIsBetter: true } },
  { label: "numeric higher target=8", habit: { type: "numeric", targetValue: 8, higherIsBetter: true } },
  { label: "numeric lower target=2", habit: { type: "numeric", targetValue: 2, higherIsBetter: false } },
  { label: "numeric no target (higher)", habit: { type: "numeric", targetValue: null, higherIsBetter: true } },
  { label: "numeric no target (lower)", habit: { type: "numeric", targetValue: null, higherIsBetter: false } },
  { label: "numeric zero target (lower)", habit: { type: "numeric", targetValue: 0, higherIsBetter: false } },
];

const STATUSES = ["done", "missed", "skipped"] as const;
const VALUES = [null, -1, 0, 1, 1.5, 2, 3, 5, 7.999, 8, 8.001, 12] as const;

describe("R-06 parity: shared outcome matches the behaviour it replaced", () => {
  it("agrees on every habit shape, status and value combination", () => {
    const mismatches: string[] = [];
    let compared = 0;

    for (const { label, habit } of HABITS) {
      for (const status of STATUSES) {
        for (const value of VALUES) {
          const entry: EntryLike = { entryDate: "2026-08-17", status, value };

          const legacy = legacyEntryOutcome(habit, entry);
          const shared = toDayCellState(
            loggedEntryOutcome(habit, { status: entry.status, value: entry.value }),
          );

          compared += 1;
          if (legacy !== shared) {
            mismatches.push(
              `${label} / status=${status} / value=${String(value)}: legacy=${legacy} shared=${shared}`,
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
    // Guard against the loops silently collapsing to nothing.
    expect(compared).toBe(HABITS.length * STATUSES.length * VALUES.length);
    expect(compared).toBe(252);
  });

  it("the live entryOutcome wrapper still matches the frozen legacy behaviour", () => {
    // Separate from the parity sweep above: this one CAN become a tautology as
    // the wrapper thins out, and that is fine. Its job is to catch a wrapper
    // that stops delegating correctly, not to define the semantics.
    for (const { habit } of HABITS) {
      for (const status of STATUSES) {
        for (const value of VALUES) {
          const entry: EntryLike = { entryDate: "2026-08-17", status, value };
          expect(entryOutcome(habit, entry)).toBe(legacyEntryOutcome(habit, entry));
        }
      }
    }
  });
});
