import { weekdayOf, type IsoDate, type Weekday } from "@/lib/date";

/**
 * The rest day (automation Guide 07).
 *
 * One function, because the gate is enforced once, server-side, in the shared
 * automation wrapper rather than in each workflow. A forgotten IF node in some
 * future n8n flow cannot then leak a deadline alert onto the day.
 *
 * What rests is the MESSAGING, never the data. Streaks, overdue maths and every
 * derivation carry on exactly as they do on any other day; the Sabbath only
 * suppresses delivery. A habit scheduled on the rest day still follows its
 * normal outcome rules, and if the owner wants to rest from the habit too, that
 * is an edit to the habit's schedule, which the schedule model already
 * supports.
 *
 * `sabbathDay` is 0=Sunday..6=Saturday, matching `weekStartsOn`. Null disables
 * it, which is the default: a rest day is a deliberate choice, not something
 * the app should assume on someone's behalf.
 */

export const SABBATH_MESSAGE =
  "Today is your Sabbath. No tasks, no scores, no catching up. Rest well.";

/** Whether `date` is the owner's rest day, in their own local calendar. */
export function isSabbathDate(sabbathDay: number | null | undefined, date: IsoDate): boolean {
  if (sabbathDay === null || sabbathDay === undefined) return false;
  if (!Number.isInteger(sabbathDay) || sabbathDay < 0 || sabbathDay > 6) return false;
  return weekdayOf(date) === (sabbathDay as Weekday);
}

/**
 * The envelope every automation response carries (Guide 07, step 2.1), so the
 * n8n guard workflow can read one shape and branch on it.
 */
export type SabbathContext = {
  localDate: IsoDate;
  timezone: string;
  isSabbath: boolean;
};

export function sabbathContext(params: {
  sabbathDay: number | null;
  localDate: IsoDate;
  timezone: string;
}): SabbathContext {
  return {
    localDate: params.localDate,
    timezone: params.timezone,
    isSabbath: isSabbathDate(params.sabbathDay, params.localDate),
  };
}
