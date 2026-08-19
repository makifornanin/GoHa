import type { Metadata } from "next";
import { cookies } from "next/headers";

import { listPushOverviewAction } from "@/app/(app)/settings/push-actions";
import { IphoneSetupClient } from "@/components/pwa/iphone-setup-client";
import { Brand } from "@/components/shell/brand";
import { PUSH_PAIRING_COOKIE } from "@/lib/push/pairing-cookie";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Connect your iPhone",
  description: "Finish setting up GoHa notifications on this iPhone.",
};

/**
 * Public landing page for a QR setup intent.
 *
 * The page itself is not authentication. Its client stages the fragment value
 * in a short-lived HttpOnly cookie, then Better Auth remains the gate before a
 * device can be associated with an account.
 */
export default async function IphoneSetupPage() {
  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()]);
  const overview = user ? await listPushOverviewAction() : null;
  const hasStagedPairing = Boolean(cookieStore.get(PUSH_PAIRING_COOKIE));

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <IphoneSetupClient
          signedIn={Boolean(user)}
          hasStagedPairing={hasStagedPairing}
          initialOverview={overview}
        />
      </div>
    </main>
  );
}
