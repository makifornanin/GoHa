import { listAutomationAction } from "@/app/(app)/settings/automation-actions";
import { listInvitesAction } from "@/app/(app)/settings/invite-actions";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { requireUser } from "@/lib/session";
import { getUserSettingsCached } from "@/lib/user-settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  // Identity from the session; settings are read/created for this user only.
  const user = await requireUser();

  /*
   * Everything the page shows, fetched together.
   *
   * The automation and people cards used to load themselves after a click,
   * which kept Settings cheap for the common visit but meant your own settings
   * were hidden behind a button and then a spinner. Reading them here costs one
   * round of parallel queries and the cards simply arrive filled in.
   */
  const [settings, automation, people] = await Promise.all([
    getUserSettingsCached(user.id),
    listAutomationAction(),
    listInvitesAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account preferences and system configuration."
      />
      <SettingsView
        profile={{ name: user.name, email: user.email }}
        settings={{
          theme: settings.theme,
          timezone: settings.timezone,
          weekStartsOn: settings.weekStartsOn,
          dailyPlanningTime: settings.dailyPlanningTime,
          eveningReflectionTime: settings.eveningReflectionTime,
          automation: {
            morningBriefEnabled: settings.morningBriefEnabled,
            eveningSummaryEnabled: settings.eveningSummaryEnabled,
            deadlineAlertsEnabled: settings.deadlineAlertsEnabled,
            deadlineLeadMinutes: settings.deadlineLeadMinutes,
            quoteSourcePref: settings.quoteSourcePref,
            sabbathDay: settings.sabbathDay,
          },
        }}
        automationOverview={automation}
        people={people}
      />
    </div>
  );
}
