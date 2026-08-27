import { describe, expect, it, vi } from "vitest";

// The Settings card pulls in a server-only chain the label map does not need.
vi.mock("server-only", () => ({}));

import { KIND_LABEL } from "@/components/settings/automation-card";
import { notificationKind } from "@/db/schema/enums";
import { notificationKindSchema } from "@/lib/validations/automation";

/**
 * The `notification_kind` enum is copied by hand into three other places, and
 * adding `smart_task_reminder` found all three already out of step with each
 * other in ways nothing was checking.
 *
 * Each copy fails differently and quietly: a missing Zod value rejects a valid
 * log write at the boundary, and a missing label renders the raw enum key in
 * the Settings activity list. Neither breaks a build or a type. This test is
 * the thing that notices.
 */

const KINDS = notificationKind.enumValues;

describe("notification kind copies", () => {
  it("the Zod schema accepts exactly the database enum", () => {
    expect([...notificationKindSchema.options].sort()).toEqual([...KINDS].sort());
  });

  it("every kind that can reach the activity list has a plain-language label", () => {
    /*
     * `test` is excluded deliberately: it exists for the token smoke check and
     * is never rendered as a user-facing event.
     */
    const rendered = KINDS.filter((kind) => kind !== "test");
    const missing = rendered.filter((kind) => !KIND_LABEL[kind]);
    expect(missing).toEqual([]);
  });

  it("has no label for a kind the database does not have", () => {
    const stale = Object.keys(KIND_LABEL).filter(
      (kind) => !(KINDS as readonly string[]).includes(kind),
    );
    expect(stale).toEqual([]);
  });

  it("still carries the smart reminder", () => {
    // Guards the specific value this phase added, so removing it from the enum
    // fails loudly rather than silently disabling a shipped feature.
    expect(KINDS).toContain("smart_task_reminder");
  });
});
