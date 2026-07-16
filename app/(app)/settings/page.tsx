import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { requireUser } from "@/lib/session";
import { getUserSettingsCached } from "@/lib/user-settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  // Identity from the session; settings are read/created for this user only.
  const user = await requireUser();
  const settings = await getUserSettingsCached(user.id);

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
        }}
      />
    </div>
  );
}
