import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/(app)/settings/actions", () => ({
  updateAutomationPrefsAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AutomationPrefsCard } from "@/components/settings/automation-prefs-card";

afterEach(cleanup);

/**
 * A toggle that cannot fire must say so.
 *
 * Smart reminders live BETWEEN the two Daily Rhythm times: two hours after the
 * morning brief, two hours before the evening summary. Without both times the
 * worker computes no window and queues no slot; with the two too close together
 * the window is empty for the same reason. In both cases the feature was
 * silently inert while the switch read "on", which is worse than being off,
 * because the owner believed reminders were coming.
 *
 * The card asks the SAME function the worker uses, so this warning cannot drift
 * away from what actually happens.
 */
const prefs = {
  morningBriefEnabled: false,
  eveningSummaryEnabled: false,
  deadlineAlertsEnabled: false,
  smartRemindersEnabled: true,
  deadlineLeadMinutes: 60,
  quoteSourcePref: "both" as const,
  sabbathDay: null,
};

describe("smart reminders warn when they cannot fire", () => {
  it("says nothing when the rhythm leaves room between the two times", () => {
    render(<AutomationPrefsCard prefs={prefs} morningTime="06:00" eveningTime="21:00" />);
    expect(screen.queryByText(/cannot be sent yet/i)).toBeNull();
  });

  it("asks for the missing times when the rhythm is unset", () => {
    render(<AutomationPrefsCard prefs={prefs} morningTime={null} eveningTime={null} />);
    expect(screen.getByText(/cannot be sent yet/i)).toBeTruthy();
    expect(screen.getByText(/set both a morning and an evening time/i)).toBeTruthy();
  });

  it("explains the real reason when the two times are too close", () => {
    // 08:00 and 09:00 leaves nothing between +2h and -2h.
    render(<AutomationPrefsCard prefs={prefs} morningTime="08:00" eveningTime="09:00" />);
    expect(screen.getByText(/too close together/i)).toBeTruthy();
  });

  it("warns when only one of the two times is set", () => {
    render(<AutomationPrefsCard prefs={prefs} morningTime="06:00" eveningTime={null} />);
    expect(screen.getByText(/set both a morning and an evening time/i)).toBeTruthy();
  });

  it("stays quiet when the feature is switched off", () => {
    // Nothing is broken about a switch that is off, so nothing is warned about.
    render(
      <AutomationPrefsCard
        prefs={{ ...prefs, smartRemindersEnabled: false }}
        morningTime={null}
        eveningTime={null}
      />,
    );
    expect(screen.queryByText(/cannot be sent yet/i)).toBeNull();
  });

  it("does not scold, it explains", () => {
    render(<AutomationPrefsCard prefs={prefs} morningTime={null} eveningTime={null} />);
    const text = screen.getByText(/cannot be sent yet/i).textContent?.toLowerCase() ?? "";
    for (const word of ["failed", "wrong", "must", "error"]) {
      expect(text).not.toContain(word);
    }
  });
});

/**
 * The same rule, for the two toggles that had no warning at all.
 *
 * `dueDailySchedule` refuses to materialize a morning brief or an evening
 * summary when its rhythm time is empty, so a switch left on with no time set
 * is inert. Three real accounts were in exactly that state, believing
 * notifications were coming, and nothing on this screen said otherwise. This is
 * the case the Smart Reminders warning already covered and these two did not.
 */
describe("morning and evening warn when their time is unset", () => {
  const on = {
    ...prefs,
    morningBriefEnabled: true,
    eveningSummaryEnabled: true,
    smartRemindersEnabled: false,
  };

  it("says the morning brief cannot fire without a morning time", () => {
    render(<AutomationPrefsCard prefs={on} morningTime={null} eveningTime="21:00" />);
    expect(screen.getByText(/Plan the day/i)).toBeTruthy();
  });

  it("says the evening summary cannot fire without an evening time", () => {
    render(<AutomationPrefsCard prefs={on} morningTime="06:00" eveningTime={null} />);
    expect(screen.getByText(/Look back/i)).toBeTruthy();
  });

  it("warns about both when neither time is set", () => {
    render(<AutomationPrefsCard prefs={on} morningTime={null} eveningTime={null} />);
    expect(screen.getAllByText(/cannot be sent yet/i).length).toBeGreaterThanOrEqual(2);
  });

  it("says nothing once both times are set", () => {
    render(<AutomationPrefsCard prefs={on} morningTime="06:00" eveningTime="21:00" />);
    expect(screen.queryByText(/cannot be sent yet/i)).toBeNull();
  });

  it("stays quiet about a switch that is off", () => {
    // Nothing is broken about a switch that is off, so nothing is warned about.
    render(
      <AutomationPrefsCard
        prefs={{ ...on, morningBriefEnabled: false, eveningSummaryEnabled: false }}
        morningTime={null}
        eveningTime={null}
      />,
    );
    expect(screen.queryByText(/cannot be sent yet/i)).toBeNull();
  });

  it("points at the fix rather than scolding", () => {
    render(<AutomationPrefsCard prefs={on} morningTime={null} eveningTime={null} />);
    const text = screen.getAllByText(/cannot be sent yet/i)[0].textContent?.toLowerCase() ?? "";
    for (const word of ["failed", "wrong", "must", "error", "invalid"]) {
      expect(text, word).not.toContain(word);
    }
    expect(text).toContain("daily rhythm");
  });
});
