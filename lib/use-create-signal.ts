"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * `?new=1` on a list screen: open the create form, once, every time it is asked.
 *
 * Four screens now answer that signal (To-dos, Goals, Habits, Brain Dump)
 * because "+ Add" can send the user to any of them. It was written once for
 * To-dos and has two non-obvious parts, both of which are bugs the moment
 * somebody re-implements it from memory:
 *
 *   1. `useState(initial)` is an INITIALIZER and runs once. Pressing Add while
 *      ALREADY on the destination is a soft navigation: the component re-renders
 *      with the prop still true, so nothing changes and the button silently does
 *      nothing on the very screen you are most likely to press it from. The fix
 *      is to adjust state during render when the prop changes, which is React's
 *      own documented answer; an effect would render the closed form first and
 *      reopen it a frame later, which flickers.
 *
 *   2. The parameter has to be SPENT. Left in the URL, pressing Add again pushes
 *      the identical address, so the prop never changes and rule 1 never fires a
 *      second time. Only `new` is removed: the prefilled relationships
 *      (`goalId`, `parentGoalId`, ...) stay, so a reload keeps them.
 *
 * Returns whether the form should be open, and a setter for the screen's own
 * open/close controls.
 */
export function useCreateSignal(
  /** True when the URL carries `?new=1`. */
  requested: boolean,
  /** The path to rewrite to, without the query. */
  pathname: string,
  /** Runs when a fresh request arrives, e.g. to clear "editing" state. */
  onOpen?: () => void,
): [boolean, (open: boolean) => void] {
  const router = useRouter();
  const [open, setOpen] = useState(requested);
  const [lastCreateSignal, setLastCreateSignal] = useState(requested);

  if (requested !== lastCreateSignal) {
    setLastCreateSignal(requested);
    if (requested) {
      onOpen?.();
      setOpen(true);
    }
  }

  useEffect(() => {
    if (!requested) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("new");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [requested, pathname, router]);

  return [open, setOpen];
}
