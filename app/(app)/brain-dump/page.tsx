import { BrainDumpView } from "@/components/brain-dump/brain-dump-view";
import { brainDumpRepo } from "@/db";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Brain Dump" };

export default async function BrainDumpPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  // Identity from the session; the query is user-scoped in the repository.
  const user = await requireUser();
  const [{ timeZone }, items, { new: newParam }] = await Promise.all([
    getUserDatePrefs(user.id),
    brainDumpRepo.listAllBrainDumpItems(user.id),
    searchParams,
  ]);

  return (
    <BrainDumpView
      items={items}
      timeZone={timeZone}
      // "+ Add > Brain dump" puts the caret in the composer rather than opening
      // a dialog: this screen's whole point is the always-ready field.
      focusCaptureOnMount={newParam === "1"}
    />
  );
}
