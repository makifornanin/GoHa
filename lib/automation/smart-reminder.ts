import { taskPriorityConfig } from "@/lib/tasks";
import { getZonedParts, zonedLocalToInstant, type IsoDate } from "@/lib/date";

/**
 * Smart task reminders: when to offer one, and what it should point at.
 *
 * Deliberately pure and database-free. Every decision here is GoHa's, and the
 * worker module supplies the rows: this file only answers "when", "is it
 * allowed", and "which task", so the rules are testable without a queue and
 * cannot drift into n8n. The automation platform narrates the facts it is
 * given; it never computes any of them.
 */

/** Four opportunities a day, at most. */
export const SMART_REMINDER_SLOTS = 4;

/** The window opens this long after the morning brief and closes before evening. */
export const SMART_WINDOW_OPEN_OFFSET_MINUTES = 120;
export const SMART_WINDOW_CLOSE_OFFSET_MINUTES = 120;

/** Preferred spacing between opportunities when the window has room for it. */
export const SMART_REMINDER_TARGET_GAP_MINUTES = 90;

/**
 * How long a delivered deadline or focus nudge suppresses a smart reminder.
 *
 * These are separate kinds saying separate things, but they land in the same
 * place: a phone. Stacking a "still on your list" on top of a "this is due in
 * ten minutes" reads as nagging rather than help.
 */
export const SMART_REMINDER_COOLDOWN_MINUTES = 90;

/** Kinds whose delivery starts that cooldown. */
export const SMART_REMINDER_COOLDOWN_KINDS = ["deadline", "focus_overrun"] as const;

/**
 * A slot's place in the day, derived from its index alone.
 *
 * Presentation is n8n's job, but WHICH part of the day this is is a fact about
 * the schedule, so GoHa decides it and hands it over as a label.
 */
export const SMART_REMINDER_STAGES = ["early", "midday", "late", "final"] as const;
export type SmartReminderStage = (typeof SMART_REMINDER_STAGES)[number];

export function smartReminderStage(slotIndex: number): SmartReminderStage {
  const clamped = Math.max(1, Math.min(SMART_REMINDER_SLOTS, Math.trunc(slotIndex)));
  return SMART_REMINDER_STAGES[clamped - 1];
}

/** `smart:{localDate}:{slotIndex}`, the claim one slot can win exactly once. */
export function smartReminderKey(localDate: IsoDate, slotIndex: number): string {
  return `smart:${localDate}:${slotIndex}`;
}

// ---------------------------------------------------------------------------
// The daily window
// ---------------------------------------------------------------------------

function parseClock(value: string | null | undefined): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Minutes-from-local-midnight for the reminder window, or null when there is
 * none.
 *
 * Both rhythm times are required: without a morning brief there is no anchor to
 * start from, and without an evening summary no point to stop at. An empty
 * rhythm time already means "do not send that message", so inheriting that
 * silence here is the consistent reading.
 */
export function smartReminderWindow(params: {
  morningTime: string | null | undefined;
  eveningTime: string | null | undefined;
}): { startMinute: number; endMinute: number } | null {
  const morning = parseClock(params.morningTime);
  const evening = parseClock(params.eveningTime);
  if (morning === null || evening === null) return null;

  const startMinute = morning + SMART_WINDOW_OPEN_OFFSET_MINUTES;
  const endMinute = evening - SMART_WINDOW_CLOSE_OFFSET_MINUTES;

  // An evening summary set before (or barely after) the morning brief leaves
  // nothing between them. Someone whose rhythm is 08:00 and 09:00 has said
  // their day is not shaped for midday nudges.
  if (endMinute <= startMinute) return null;
  return { startMinute, endMinute };
}

/**
 * FNV-1a over a string. Small, stable and dependency-free.
 *
 * The same function the daily quote pick uses. It is a spreading function, not
 * a security primitive, and the only property that matters is that it returns
 * the same number for the same input forever.
 */
export function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A deterministic 0..1 draw for one slot of one user's day. */
function draw(seed: string, slotIndex: number): number {
  return hashSeed(`${seed}#${slotIndex}`) / 0x100000000;
}

/**
 * The four local times, as minutes from midnight, for one user and one date.
 *
 * DERIVED, not stored. The times must survive a worker restart, a redeploy and
 * every five-minute poll, and deriving them from `userId + localDate` gives
 * that for free: there is no row to migrate, nothing to backfill, and no way
 * for two processes to disagree. Persisting them would have meant a table whose
 * only job is to remember a number this function can always recompute.
 *
 * Each slot owns an equal share of the window and is jittered inside its own
 * share, so the times look unplanned without ever crossing each other or
 * leaving the window. Tomorrow's date is a different seed and a different day.
 */
export function smartReminderSlots(params: {
  userId: string;
  localDate: IsoDate;
  window: { startMinute: number; endMinute: number };
  slots?: number;
}): number[] {
  const count = params.slots ?? SMART_REMINDER_SLOTS;
  const { startMinute, endMinute } = params.window;
  const span = endMinute - startMinute;
  const seed = `${params.userId}:${params.localDate}`;

  const share = span / count;
  /*
   * How far a slot may wander inside its own share.
   *
   * Two adjacent slots are `share` apart at their centres, so each one drifting
   * by `j` can close the gap to `share - 2j`. Capping `j` at half the slack
   * over the target keeps the promised spacing intact: at a third of a share
   * instead, a nine-hour window produced gaps of 47 minutes, which a test
   * caught before this shipped.
   *
   * When the window is too narrow to hold the target at all the slack is
   * negative, and the slots fall back to a small jitter around an even spread:
   * the boundaries and the even distribution matter more than the spacing that
   * the day cannot give.
   */
  const slackPerSide = (share - SMART_REMINDER_TARGET_GAP_MINUTES) / 2;
  const jitterRoom = slackPerSide > 0 ? Math.min(share / 3, slackPerSide) : share / 6;

  const placed: number[] = [];
  for (let i = 0; i < count; i++) {
    const centre = startMinute + share * (i + 0.5);
    const offset = (draw(seed, i + 1) - 0.5) * 2 * jitterRoom;
    const minute = Math.round(centre + offset);

    /*
     * Each slot must land on a minute strictly after the previous one.
     *
     * Rounding four centres into a window only a minute or two wide collapses
     * them onto the same clock minute: a 1-minute window produced 10:00, 10:00,
     * 10:01, 10:01, which is two pairs of notifications fired simultaneously,
     * not four opportunities. A window that narrow physically cannot hold four
     * distinct minutes, so the honest answer is to place as many as it can
     * rather than to invent duplicates or spill past the boundary.
     *
     * This never engages in a normal window: the floor sits far below where
     * jitter can reach, so every wider case is untouched.
     */
    const floor = placed.length === 0 ? startMinute : placed[placed.length - 1] + 1;
    if (floor > endMinute) break;
    // Belt and braces: never outside the window, whatever the arithmetic did.
    placed.push(Math.max(floor, Math.min(endMinute, minute)));
  }
  return placed;
}

/** The slot times as real instants in the user's zone, ascending. */
export function smartReminderInstants(params: {
  userId: string;
  localDate: IsoDate;
  timezone: string;
  morningTime: string | null | undefined;
  eveningTime: string | null | undefined;
}): { slotIndex: number; minute: number; at: Date }[] {
  const window = smartReminderWindow({
    morningTime: params.morningTime,
    eveningTime: params.eveningTime,
  });
  if (!window) return [];

  const minutes = smartReminderSlots({
    userId: params.userId,
    localDate: params.localDate,
    window,
  });

  const out: { slotIndex: number; minute: number; at: Date }[] = [];
  minutes.forEach((minute, i) => {
    const hh = String(Math.floor(minute / 60)).padStart(2, "0");
    const mm = String(minute % 60).padStart(2, "0");
    try {
      const at = zonedLocalToInstant(`${params.localDate}T${hh}:${mm}:00`, params.timezone);
      if (!at) return;
      /*
       * A local time a DST jump skipped does not exist, and scheduling it would
       * fire at a different wall time than the one chosen. The same guard the
       * rhythm schedule uses: drop that slot rather than surprise the reader.
       */
      const actual = getZonedParts(at, params.timezone);
      if (actual.hour !== Number(hh) || actual.minute !== Number(mm)) return;
      out.push({ slotIndex: i + 1, minute, at });
    } catch {
      // An invalid saved zone is handled by the caller's per-account guard.
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Anchor selection
// ---------------------------------------------------------------------------

/** The minimum a candidate task needs for this decision. */
export type SmartReminderCandidate = {
  id: string;
  title: string;
  priority: keyof typeof taskPriorityConfig;
  goalId: string | null;
  sortOrder: number;
  createdAt: Date;
};

/**
 * Which task this reminder is about.
 *
 * One task, never a list: a notification that recites everything left is a
 * report, and a report is easy to dismiss without reading. Highest priority
 * first, using GoHa's own enum weights rather than a new scale invented here.
 *
 * `previousAnchorId` is avoided when there is anything else to say, so two
 * reminders in a row do not name the same task while others are waiting. When
 * it is the only thing left it is named again, because that IS the honest
 * answer.
 *
 * Ties break on the list's own order (sortOrder, then creation, then id), so
 * the same day with the same data always chooses the same task.
 */
export function selectAnchorTask(
  candidates: SmartReminderCandidate[],
  previousAnchorId?: string | null,
): SmartReminderCandidate | null {
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
    const byPriority = taskPriorityConfig[b.priority].weight - taskPriorityConfig[a.priority].weight;
    if (byPriority !== 0) return byPriority;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });

  if (!previousAnchorId) return ranked[0];
  return ranked.find((task) => task.id !== previousAnchorId) ?? ranked[0];
}

// ---------------------------------------------------------------------------
// The fallback notification
// ---------------------------------------------------------------------------

/**
 * What is delivered if the workflow's own presentation fails.
 *
 * Deterministic and made only of facts GoHa actually holds: this task is on
 * today's list, and it is not finished. It does not say the task was untouched,
 * that nothing was done, or that anyone is behind, because GoHa does not know
 * any of that and a notification that guesses wrong about someone's day is
 * worse than no notification.
 *
 * Short enough for a push, which cuts the body around 120 characters on most
 * phones.
 */
export function smartReminderFallback(params: {
  anchorTitle: string;
  remainingCount: number;
  stage: SmartReminderStage;
}): { title: string; body: string; url: string } {
  const title = params.stage === "final" ? "Last call for today 👀" : "Quick task check 👀";
  const others = params.remainingCount - 1;
  const tail =
    others > 0
      ? ` ${others} other${others === 1 ? "" : "s"} still open, but this one first.`
      : " Give it one solid push and keep the momentum going.";
  return {
    title,
    body: `${params.anchorTitle} is still on today's list.${tail}`,
    url: "/today",
  };
}

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

export type SmartReminderPayload = {
  localDate: IsoDate;
  timezone: string;
  /** 1..4 within the day, and its plain-language position. */
  slotIndex: number;
  stage: SmartReminderStage;
  /** The account's display name, or null. Never an email address. */
  userName: string | null;
  anchorTask: {
    id: string;
    title: string;
    priority: string;
    goalTitle: string | null;
  };
  /** Open tasks left on today, including the anchor. Always >= 1. */
  remainingCount: number;
  completedToday: number;
  totalToday: number;
  /** Active tasks whose date has already passed. Context, not an accusation. */
  overdueCount: number;
  url: string;
};

/**
 * The facts a smart reminder is allowed to be built from.
 *
 * Everything here is something GoHa can prove from its own rows: what is on
 * today, what is finished, what is late, and which single task this message is
 * about. There is deliberately no "you have been idle", no "you are falling
 * behind" and no streak: GoHa cannot see whether someone spent the afternoon on
 * the task without ticking it, and a notification that assumes the worst about
 * a day it cannot observe is the thing that makes people turn notifications off.
 *
 * n8n phrases this. It does not get to add facts to it.
 */
export function toSmartReminderPayload(params: {
  localDate: IsoDate;
  timezone: string;
  slotIndex: number;
  userName: string | null;
  anchor: SmartReminderCandidate;
  goalTitle?: string | null;
  remainingCount: number;
  completedToday: number;
  totalToday: number;
  overdueCount: number;
}): SmartReminderPayload {
  return {
    localDate: params.localDate,
    timezone: params.timezone,
    slotIndex: params.slotIndex,
    stage: smartReminderStage(params.slotIndex),
    userName: params.userName,
    anchorTask: {
      id: params.anchor.id,
      title: params.anchor.title,
      priority: params.anchor.priority,
      goalTitle: params.goalTitle ?? null,
    },
    remainingCount: Math.max(1, params.remainingCount),
    completedToday: params.completedToday,
    totalToday: params.totalToday,
    overdueCount: params.overdueCount,
    url: "/today",
  };
}
