import { Calendar } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <ComingSoon
      icon={Calendar}
      title="Calendar"
      description="Your schedule and time-blocked commitments."
      empty={{
        title: "Calendar is on the way",
        description: "The calendar view arrives in a later expansion slice.",
      }}
    />
  );
}
