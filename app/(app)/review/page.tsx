import { NotebookPen } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Review" };

export default function ReviewPage() {
  return (
    <ComingSoon
      icon={NotebookPen}
      title="Review"
      description="Weekly review and reflection to close the loop."
      empty={{
        title: "Review is on the way",
        description:
          "Weekly review and reflection arrive in a later expansion slice.",
      }}
    />
  );
}
