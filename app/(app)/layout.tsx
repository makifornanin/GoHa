import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileBottomNav } from "@/components/shell/mobile-bottom-nav";
import { MobileHeader } from "@/components/shell/mobile-header";
import { ThemeSync } from "@/components/theme-sync";
import { requireUser } from "@/lib/session";
import { getUserSettingsCached } from "@/lib/user-settings";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative protection for every surface in the (app) group. Redirects to
  // /login when there is no valid session.
  const user = await requireUser();
  const navUser = { name: user.name, email: user.email, image: user.image };
  // Make the persisted theme authoritative for this device on load (no flash).
  const settings = await getUserSettingsCached(user.id);

  return (
    <div className="min-h-screen bg-canvas">
      <ThemeSync dbTheme={settings.theme} />
      <AppSidebar className="hidden md:flex" user={navUser} />
      <div className="flex min-h-screen flex-col md:pl-[260px]">
        <MobileHeader className="md:hidden" user={navUser} />
        <AppHeader className="hidden md:flex" />
        {/* Page padding: 24 desktop, 16 mobile; top 24 (spec section 7).
            Deliberately NOT capped to a reading measure: a fixed max-width left
            a monitor showing mostly empty gutters. The page fills the window and
            the grids inside it add COLUMNS at wide breakpoints, so extra width
            buys more content rather than more whitespace. */}
        <main className="flex-1 pb-24 md:pb-12">
          <div className="w-full px-4 pt-6 md:px-6 lg:px-8">{children}</div>
        </main>
      </div>
      <MobileBottomNav className="md:hidden" />
    </div>
  );
}
