import { MANILA_TZ } from "@/lib/date";

/**
 * A small, curated set of IANA timezones for the Settings picker. Kept lean and
 * grouped for a single-owner app rather than exhaustively listing every zone.
 * Asia/Manila is the default (CLAUDE.md section 6). Any string that passes
 * `isValidTimeZone` is still accepted on the server, so this list is only a
 * convenience for the UI.
 */
export type TimezoneOption = { value: string; label: string };

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "Asia/Manila", label: "Manila (GMT+8)" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (GMT+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (GMT+9)" },
  { value: "Asia/Jakarta", label: "Jakarta (GMT+7)" },
  { value: "Asia/Bangkok", label: "Bangkok (GMT+7)" },
  { value: "Asia/Kolkata", label: "India (GMT+5:30)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Australia/Sydney", label: "Sydney (GMT+10/+11)" },
  { value: "Europe/London", label: "London (GMT+0/+1)" },
  { value: "Europe/Berlin", label: "Berlin (GMT+1/+2)" },
  { value: "America/New_York", label: "New York (GMT-5/-4)" },
  { value: "America/Chicago", label: "Chicago (GMT-6/-5)" },
  { value: "America/Denver", label: "Denver (GMT-7/-6)" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT-8/-7)" },
  { value: "UTC", label: "UTC" },
];

export const DEFAULT_TIMEZONE = MANILA_TZ;

/** Whether a string is a real IANA timezone the runtime understands. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
