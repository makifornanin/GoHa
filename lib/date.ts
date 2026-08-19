/**
 * Centralized date and timezone helpers for GoHa (CLAUDE.md section 6).
 *
 * The primary user timezone is Asia/Manila, and every `manila*` helper keeps
 * that exact behavior. The generic `zoned*` core underneath accepts any IANA
 * timezone, so a user who changes their timezone in Settings has it honored
 * across the app while Manila remains the default everywhere it is not passed.
 *
 * Two kinds of time exist in the app:
 *  - Real instants (audit columns, `dueAt`, `startedAt`) -> JS `Date` / TIMESTAMPTZ.
 *  - Local calendar dates (`entryDate`, `scheduledFor`, buckets) -> "YYYY-MM-DD".
 *
 * Rules enforced here:
 *  - Never truncate a UTC instant naively to get a local date; resolve the
 *    calendar date using the IANA zone via Intl.
 *  - Converting a local wall-clock back to a UTC instant resolves the zone's
 *    real offset at that instant via Intl (correct across DST), rather than a
 *    hardcoded constant. For Manila (no DST since 1978) this is a constant +08:00,
 *    which the boundary tests still assert exactly.
 *
 * Everything here is dependency-free (Intl only) and deterministic, so it is
 * safe to import from both server and client code.
 */

export const MANILA_TZ = "Asia/Manila";

/** Manila's constant UTC offset. The Philippines has observed no DST since 1978. */
export const MANILA_UTC_OFFSET = "+08:00";

/** A local calendar date in "YYYY-MM-DD" form. */
export type IsoDate = string;

/** Date-derived view buckets for tasks and goals (CLAUDE.md section 7). */
export type DateBucket =
  | "today"
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year";

/** A half-open local-date range: `start <= date < endExclusive`. */
export type DateRange = { start: IsoDate; endExclusive: IsoDate };

/** 0=Sunday .. 6=Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Zoned wall-clock resolution (Intl only, cached formatters per zone)
// ---------------------------------------------------------------------------

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Break an instant into its wall-clock components in the given zone. */
export function getZonedParts(instant: Date, timeZone: string = MANILA_TZ): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    second: lookup("second"),
  };
}

/** Break an instant into its Asia/Manila wall-clock components. */
export function getManilaParts(instant: Date): ZonedParts {
  return getZonedParts(instant, MANILA_TZ);
}

/** The zone's offset (ms, zone-ahead-of-UTC positive) at a given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const instantSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - instantSeconds;
}

/** The UTC instant of 00:00:00 local time on the given date, in the given zone. */
function zonedWallToInstant(wallUtcMs: number, timeZone: string): Date {
  const off1 = zoneOffsetMs(new Date(wallUtcMs), timeZone);
  let instant = wallUtcMs - off1;
  const off2 = zoneOffsetMs(new Date(instant), timeZone);
  // Re-resolve once across a DST transition (no-op for fixed-offset zones).
  if (off2 !== off1) instant = wallUtcMs - off2;
  return new Date(instant);
}

// ---------------------------------------------------------------------------
// Instant -> local date / display
// ---------------------------------------------------------------------------

/**
 * The calendar date an instant falls on in the given zone. A habit logged at
 * 12:30 AM local belongs to that local date, not the (earlier) UTC date.
 */
export function toZonedDate(instant: Date, timeZone: string = MANILA_TZ): IsoDate {
  const { year, month, day } = getZonedParts(instant, timeZone);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** The Asia/Manila calendar date an instant falls on. */
export function toManilaDate(instant: Date): IsoDate {
  return toZonedDate(instant, MANILA_TZ);
}

/** Today's calendar date in the given zone. `now` is injectable for tests. */
export function zonedToday(now: Date = new Date(), timeZone: string = MANILA_TZ): IsoDate {
  return toZonedDate(now, timeZone);
}

/** Today's Manila calendar date. */
export function manilaToday(now: Date = new Date()): IsoDate {
  return zonedToday(now, MANILA_TZ);
}

/** The part of the day for a greeting: morning, afternoon, or evening. */
export function zonedPartOfDay(
  now: Date = new Date(),
  timeZone: string = MANILA_TZ,
): "morning" | "afternoon" | "evening" {
  const { hour } = getZonedParts(now, timeZone);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** The part of the Manila day for a greeting. */
export function manilaPartOfDay(now: Date = new Date()): "morning" | "afternoon" | "evening" {
  return zonedPartOfDay(now, MANILA_TZ);
}

/**
 * Convert a `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm"), entered
 * in the user's local wall-clock time, into the exact UTC instant to store in a
 * TIMESTAMPTZ column. Returns null for empty/invalid input.
 */
export function zonedLocalToInstant(
  local: string | null | undefined,
  timeZone: string = MANILA_TZ,
): Date | null {
  if (!local) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, hh, mm, ss] = match;
  const wallUtcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), ss ? Number(ss) : 0);
  const instant = zonedWallToInstant(wallUtcMs, timeZone);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** Convert a Manila datetime-local value into a UTC instant. */
export function manilaLocalToInstant(local: string | null | undefined): Date | null {
  return zonedLocalToInstant(local, MANILA_TZ);
}

/** Format an instant as a zone-local `datetime-local` input value ("YYYY-MM-DDTHH:mm"). */
export function instantToZonedDateTimeInput(
  instant: Date | null | undefined,
  timeZone: string = MANILA_TZ,
): string {
  if (!instant) return "";
  const { year, month, day, hour, minute } = getZonedParts(instant, timeZone);
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

/** Format an instant as a Manila `datetime-local` input value. */
export function instantToManilaDateTimeInput(instant: Date | null | undefined): string {
  return instantToZonedDateTimeInput(instant, MANILA_TZ);
}

/** Format a due-at instant for display in the given zone, e.g. "Oct 15, 2:00 PM". */
export function formatZonedDateTimeMedium(
  instant: Date | null | undefined,
  timeZone: string = MANILA_TZ,
): string | null {
  if (!instant) return null;
  const { month, day, hour, minute } = getZonedParts(instant, timeZone);
  const monthName = MONTHS_SHORT[month - 1];
  if (!monthName) return null;
  const meridiem = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${monthName} ${day}, ${hour12}:${pad2(minute)} ${meridiem}`;
}

/** Format a due-at instant for display in Manila time. */
export function formatManilaDateTimeMedium(instant: Date | null | undefined): string | null {
  return formatZonedDateTimeMedium(instant, MANILA_TZ);
}

// ---------------------------------------------------------------------------
// Local-date display (zone-independent string math)
// ---------------------------------------------------------------------------

/**
 * Format a local date string ("YYYY-MM-DD") for display, e.g. "Oct 15, 2026".
 * Parsed from the string parts (no Date/tz involved) so it never drifts by a day.
 * Returns null for empty/invalid input.
 */
export function formatIsoDateMedium(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthName = MONTHS_SHORT[Number(month) - 1];
  if (!monthName) return null;
  return `${monthName} ${Number(day)}, ${year}`;
}

/** Long-form date for a local date string, e.g. "Thursday, October 26". */
export function formatManilaLongDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, , month, day] = match;
  const monthName = MONTHS_FULL[Number(month) - 1];
  const weekday = WEEKDAYS_FULL[weekdayOf(iso)];
  if (!monthName || !weekday) return null;
  return `${weekday}, ${monthName} ${Number(day)}`;
}

// ---------------------------------------------------------------------------
// Instant ranges for TIMESTAMPTZ filtering
// ---------------------------------------------------------------------------

/** The UTC instant of 00:00:00 local time on the given date, in the given zone. */
export function startOfZonedDayUtc(date: IsoDate, timeZone: string = MANILA_TZ): Date {
  const wallUtcMs = new Date(`${date}T00:00:00.000Z`).getTime();
  return zonedWallToInstant(wallUtcMs, timeZone);
}

/** The UTC instant of 00:00:00 Asia/Manila on the given local date. */
export function startOfManilaDayUtc(date: IsoDate): Date {
  return startOfZonedDayUtc(date, MANILA_TZ);
}

/** The half-open UTC instant range covering a local date in the given zone. */
export function zonedDayRangeUtc(
  date: IsoDate,
  timeZone: string = MANILA_TZ,
): { start: Date; endExclusive: Date } {
  return {
    start: startOfZonedDayUtc(date, timeZone),
    endExclusive: startOfZonedDayUtc(addDays(date, 1), timeZone),
  };
}

/** The half-open UTC instant range covering a Manila local date. */
export function manilaDayRangeUtc(date: IsoDate): { start: Date; endExclusive: Date } {
  return zonedDayRangeUtc(date, MANILA_TZ);
}

// ---------------------------------------------------------------------------
// Local-date arithmetic (pure string math, zone-independent)
// ---------------------------------------------------------------------------

/** Add (or subtract) whole days to a local date, staying in "YYYY-MM-DD". */
export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Day of week (0=Sunday) for a local date. */
export function weekdayOf(date: IsoDate): Weekday {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() as Weekday;
}

/** Start of the week containing `date`, honoring `weekStartsOn` (default Monday). */
export function startOfWeek(date: IsoDate, weekStartsOn: Weekday = 1): IsoDate {
  const diff = (weekdayOf(date) - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

/** First day of the month containing `date`. */
export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

/** First day of the quarter containing `date`. */
export function startOfQuarter(date: IsoDate): IsoDate {
  const [year, month] = date.split("-").map(Number);
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${pad2(startMonth)}-01`;
}

/** First day of the year containing `date`. */
export function startOfYear(date: IsoDate): IsoDate {
  return `${date.slice(0, 4)}-01-01`;
}

/** Add whole months to the first-of-month date, rolling the year as needed. */
function addMonths(firstOfMonth: IsoDate, months: number): IsoDate {
  const [year, month] = firstOfMonth.split("-").map(Number);
  const zeroBased = month - 1 + months;
  const newYear = year + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12;
  return `${newYear}-${pad2(newMonth + 1)}-01`;
}

/**
 * Half-open local-date range for a date-derived view bucket, relative to `now`
 * in the given zone. Because ISO dates sort lexicographically, these strings can
 * be compared directly against a DATE column (`scheduledFor >= start AND
 * scheduledFor < endExclusive`).
 */
export function zonedBucketRange(
  bucket: DateBucket,
  now: Date = new Date(),
  weekStartsOn: Weekday = 1,
  timeZone: string = MANILA_TZ,
): DateRange {
  const today = zonedToday(now, timeZone);
  switch (bucket) {
    case "today":
      return { start: today, endExclusive: addDays(today, 1) };
    case "this_week": {
      const start = startOfWeek(today, weekStartsOn);
      return { start, endExclusive: addDays(start, 7) };
    }
    case "this_month": {
      const start = startOfMonth(today);
      return { start, endExclusive: addMonths(start, 1) };
    }
    case "this_quarter": {
      const start = startOfQuarter(today);
      return { start, endExclusive: addMonths(start, 3) };
    }
    case "this_year": {
      const start = startOfYear(today);
      return { start, endExclusive: addMonths(start, 12) };
    }
  }
}

/** Half-open local-date range for a bucket, relative to `now` in Manila time. */
export function manilaBucketRange(
  bucket: DateBucket,
  now: Date = new Date(),
  weekStartsOn: Weekday = 1,
): DateRange {
  return zonedBucketRange(bucket, now, weekStartsOn, MANILA_TZ);
}

/**
 * A stored "HH:MM[:SS]" as a readable clock label: "14:30" -> "2:30 PM".
 *
 * A `time` column carries no date and no zone, so this is pure formatting on
 * the wall-clock value the user typed. It deliberately does not go through
 * `Intl` with a fabricated date, which would drag a timezone into a value that
 * has none and shift it by an hour across a DST boundary.
 */
export function formatClockLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = match[2];
  if (hour24 > 23 || Number(minute) > 59) return null;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${suffix}`;
}
