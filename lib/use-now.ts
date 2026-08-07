"use client";

import { useEffect, useState } from "react";

/**
 * A `Date` that stays current instead of freezing when the component mounts.
 *
 * Date-derived views (Today, This week, Late) are all computed from "now"
 * (CLAUDE.md section 7: no stored buckets). Capturing it once with
 * `useMemo(() => new Date(), [])` meant a tab left open overnight kept
 * classifying work against yesterday: "Today" showed the wrong day and the late
 * count stopped moving, silently, with nothing on screen to suggest a reload was
 * needed.
 *
 * A minute is far finer than any boundary that matters here (a calendar date or
 * a due instant) and costs one re-render per minute.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
