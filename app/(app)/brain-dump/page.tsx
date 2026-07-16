import { BrainDumpView } from "@/components/brain-dump/brain-dump-view";
import { brainDumpRepo } from "@/db";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Brain Dump" };

export default async function BrainDumpPage() {
  // Identity from the session; the query is user-scoped in the repository.
  const user = await requireUser();
  const [{ timeZone }, items] = await Promise.all([
    getUserDatePrefs(user.id),
    brainDumpRepo.listAllBrainDumpItems(user.id),
  ]);

  return <BrainDumpView items={items} timeZone={timeZone} />;
}
