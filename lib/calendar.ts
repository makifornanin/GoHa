import { addDays, startOfMonth, startOfWeek, type IsoDate, type Weekday } from "@/lib/date";

/** How many cells `buildMonthGrid` renders: six whole weeks. */
export const MONTH_GRID_DAYS = 42;

/**
 * Pure month-grid construction for the Tasks calendar view. Everything is local
 * date-string arithmetic (no Date/timezone maths), so a grid can never drift by
 * a day the way UTC truncation does (CLAUDE.md section 6).
 */

export type CalendarDay = {
  date: IsoDate;
  /** Day number, e.g. 14. */
  day: number;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inMonth: boolean;
  isToday: boolean;
};

export type CalendarWeek = CalendarDay[];

/** Month label, e.g. "August 2026". */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(anchor: IsoDate): string {
  const [year, month] = anchor.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Shift a month anchor ("YYYY-MM-01") by whole months. */
export function addMonths(anchor: IsoDate, months: number): IsoDate {
  const [year, month] = anchor.split("-").map(Number);
  const zeroBased = month - 1 + months;
  const newYear = year + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12;
  return `${newYear}-${String(newMonth + 1).padStart(2, "0")}-01`;
}

/**
 * Narrow a `?month=` parameter to a month anchor ("YYYY-MM-01").
 *
 * Accepts "YYYY-MM" and "YYYY-MM-DD"; anything else falls back to the month
 * containing `today`. Deliberately permissive about the day part, because the
 * anchor is a month and a link carrying a full date should still resolve.
 */
export function parseMonthAnchor(value: string | undefined | null, today: IsoDate): IsoDate {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
    if (match) {
      const month = Number(match[2]);
      if (month >= 1 && month <= 12) return `${match[1]}-${match[2]}-01`;
    }
  }
  return startOfMonth(today);
}

/**
 * The exact inclusive local-date range `buildMonthGrid` will render.
 *
 * The calendar used to fetch a fixed window around TODAY while month
 * navigation was unlimited, so paging far enough away silently produced a
 * month with no habits and no focus time and no indication anything was
 * missing (audit R-07). Deriving the range from the anchor is what lets the
 * server fetch precisely what the grid is about to show.
 */
export function monthGridRange(
  anchor: IsoDate,
  weekStartsOn: Weekday = 1,
): { start: IsoDate; end: IsoDate } {
  const start = startOfWeek(startOfMonth(anchor), weekStartsOn);
  return { start, end: addDays(start, MONTH_GRID_DAYS - 1) };
}

/**
 * The 6x7 grid covering the month containing `anchor`, padded out to whole
 * weeks so every row has 7 cells and the grid never reflows between months.
 */
export function buildMonthGrid(
  anchor: IsoDate,
  today: IsoDate,
  weekStartsOn: Weekday = 1,
): CalendarWeek[] {
  const first = startOfMonth(anchor);
  const month = first.slice(0, 7);
  const gridStart = startOfWeek(first, weekStartsOn);

  const weeks: CalendarWeek[] = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w += 1) {
    const week: CalendarWeek = [];
    for (let d = 0; d < 7; d += 1) {
      week.push({
        date: cursor,
        day: Number(cursor.slice(8, 10)),
        inMonth: cursor.slice(0, 7) === month,
        isToday: cursor === today,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Weekday headers in display order for the user's week start. */
export function weekdayHeaders(weekStartsOn: Weekday = 1): string[] {
  const base = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 7 }, (_, i) => base[(weekStartsOn + i) % 7]);
}

/** Group items by their local date, preserving input order within each day. */
export function groupByDate<T>(items: T[], dateOf: (item: T) => IsoDate | null): Map<IsoDate, T[]> {
  const map = new Map<IsoDate, T[]>();
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    const bucket = map.get(date);
    if (bucket) bucket.push(item);
    else map.set(date, [item]);
  }
  return map;
}
