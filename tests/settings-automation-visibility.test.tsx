import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/components/settings/automation-card", () => ({
  AutomationCard: () => <div data-testid="advanced-automation">Advanced Automation API</div>,
}));
vi.mock("@/components/settings/iphone-connection-card", () => ({
  IphoneConnectionCard: () => <div data-testid="consumer-push">Connect your iPhone</div>,
}));
vi.mock("@/components/settings/invites-card", () => ({ InvitesCard: () => null }));
vi.mock("@/components/settings/automation-prefs-card", () => ({
  AutomationPrefsCard: () => null,
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { changePassword: vi.fn(), signOut: vi.fn() },
}));

const { SettingsView } = await import("@/components/settings/settings-view");

const settings = {
  theme: "system" as const,
  timezone: "Asia/Manila",
  weekStartsOn: 1,
  dailyPlanningTime: null,
  eveningReflectionTime: null,
  automation: {
    morningBriefEnabled: false,
    eveningSummaryEnabled: false,
    deadlineAlertsEnabled: false,
    deadlineLeadMinutes: 60,
    quoteSourcePref: "both" as const,
    sabbathDay: null,
  },
};

const pushOverview = {
  deviceCount: 0,
  pendingPairing: null,
  vapidPublicKey: null,
  pushConfigured: false,
};

const automationOverview = {
  tokens: [],
  requests: [],
  sent: [],
  baseUrl: "https://goha.example",
};

const people = {
  isOwner: false,
  signupMode: "invite_only" as const,
  invites: [],
};

describe("Settings automation audience", () => {
  afterEach(cleanup);

  it("shows normal users only the consumer push experience", () => {
    render(
      <SettingsView
        profile={{ name: "Friend", email: "friend@example.com" }}
        settings={settings}
        automationOverview={null}
        pushOverview={pushOverview}
        showAdvancedAutomation={false}
        people={people}
      />,
    );

    expect(screen.getByTestId("consumer-push")).toBeInTheDocument();
    expect(screen.queryByTestId("advanced-automation")).not.toBeInTheDocument();
  });

  it("preserves the owner API interface alongside consumer push setup", () => {
    render(
      <SettingsView
        profile={{ name: "Owner", email: "milcamark7@gmail.com" }}
        settings={settings}
        automationOverview={automationOverview}
        pushOverview={pushOverview}
        showAdvancedAutomation
        people={{ ...people, isOwner: true }}
      />,
    );

    expect(screen.getByTestId("consumer-push")).toBeInTheDocument();
    expect(screen.getByTestId("advanced-automation")).toBeInTheDocument();
  });
});
