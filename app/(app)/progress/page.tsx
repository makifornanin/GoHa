import { TrendingUp } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <ComingSoon
      icon={TrendingUp}
      title="Progress"
      description="Life score trends and progress analytics over time."
      empty={{
        title: "Progress is on the way",
        description:
          "Progress analytics and life score trends arrive in a later expansion slice.",
      }}
    />
  );
}
