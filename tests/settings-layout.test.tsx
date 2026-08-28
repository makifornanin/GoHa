import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const stub = () => vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));
vi.mock("@/app/(app)/settings/actions", () => ({
  updateProfileAction: stub(), updateThemeAction: stub(), updateRhythmAction: stub(),
  updatePreferencesAction: stub(), updateAutomationPrefsAction: stub(),
}));
vi.mock("@/app/(app)/settings/archive-actions", () => ({
  listArchivedAction: stub(), restoreArchivedAction: stub(), deleteArchivedAction: stub(),
}));
vi.mock("@/app/(app)/settings/export-actions", () => ({ exportMyDataAction: stub() }));
vi.mock("@/app/(app)/settings/automation-actions", () => ({
  listAutomationAction: stub(), createAutomationTokenAction: stub(),
  revokeAutomationTokenAction: stub(), deleteAutomationTokenAction: stub(),
}));
vi.mock("@/app/(app)/settings/invite-actions", () => ({
  listInvitesAction: stub(), setSignupModeAction: stub(), createInviteAction: stub(),
  revokeInviteAction: stub(), deleteInviteAction: stub(),
}));
vi.mock("@/app/(app)/settings/push-actions", () => ({
  listPushOverviewAction: stub(), createPushPairingAction: stub(), getStagedPairingStateAction: stub(),
  subscribePushAction: stub(), getCurrentPushStateAction: stub(), unsubscribePushAction: stub(),
  sendTestPushAction: stub(),
}));

const { SettingsView } = await import("@/components/settings/settings-view");

/**
 * Settings is the page with the most cards, and it had grown into one flat grid
 * where every card looked equally important. The cards are now grouped under
 * section headings.
 *
 * This renders the whole page because the two things worth protecting are only
 * visible from the top: that each group actually reaches the DOM, and that a
 * section heading outranks the card headings inside it. Writing this test is
 * what surfaced two cards whose titles simply repeated their own section.
 */
describe("settings layout", () => {
  it("groups the cards under section headings", () => {
    render(
      <SettingsView
        profile={{ name: "Mark", email: "m@example.com" }}
        settings={{
          theme: "system", timezone: "Asia/Manila", weekStartsOn: 1,
          dailyPlanningTime: "06:00", eveningReflectionTime: "21:00",
          automation: {
            morningBriefEnabled: true, eveningSummaryEnabled: true, deadlineAlertsEnabled: true,
      smartRemindersEnabled: false,
            deadlineLeadMinutes: 60, quoteSourcePref: "both", sabbathDay: null,
          },
        }}
        people={{ isOwner: true, signupMode: "open", invites: [] }}
        pushOverview={{ pushConfigured: true, deviceCount: 0, pendingPairing: null, vapidPublicKey: "test-key" }}
        automationOverview={null}
        showAdvancedAutomation={false}
      />,
    );
    for (const h of ["Account", "Time and rhythm", "Notifications", "People", "Your data"]) {
      expect(screen.getByRole("heading", { name: h, level: 2 })).toBeTruthy();
    }
    // Cards render inside those sections, one level down. Both used to be h2,
    // which flattened the page for screen readers and made "People" ambiguous
    // between the group and the card sitting in it.
    for (const card of ["Profile", "Password", "Notification Devices", "Invitations", "Archive"]) {
      expect(screen.getByRole("heading", { name: card, level: 3 })).toBeTruthy();
    }
  });
});
