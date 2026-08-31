"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Error boundary for the Tasks route. Never a blank panel: explain and retry. */
export default function TasksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("To-dos route error", error);
  }, [error]);

  return (
    <div className="card-shadow flex flex-col items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest px-6 py-16 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-error/10 text-error">
        <TriangleAlert className="size-7" aria-hidden />
      </div>
      <h2 className="text-headline-md text-on-surface">We couldn&apos;t load your tasks</h2>
      <p className="mt-2 max-w-md text-body-md text-on-surface-variant">
        Something went wrong reaching the server. Your data is safe. Please try again.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
