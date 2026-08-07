"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { zonedToday } from "@/lib/date";

/**
 * Refetches a server-rendered page when the user's local calendar date rolls
 * over.
 *
 * Pages like Today and Habits resolve "today" on the SERVER and pass it down. A
 * tab left open past midnight therefore kept rendering yesterday: yesterday's
 * greeting, yesterday's task list, yesterday's habit check-ins, with today's
 * work invisible. Nothing on screen hinted that a reload was required.
 *
 * Renders nothing; it only watches the clock and asks the router to refresh.
 */
export function DateRolloverRefresh({
  today,
  timeZone,
}: {
  today: string;
  timeZone: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (zonedToday(new Date(), timeZone) !== today) router.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [today, timeZone, router]);

  return null;
}
