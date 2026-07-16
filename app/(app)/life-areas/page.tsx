import { LifeAreasView } from "@/components/life-areas/life-areas-view";
import { lifeAreasRepo } from "@/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Life Areas" };

export default async function LifeAreasPage() {
  // Identity from the session; the query is scoped to this user in the repo.
  const user = await requireUser();
  const areas = await lifeAreasRepo.listLifeAreas(user.id);

  return <LifeAreasView areas={areas} />;
}
