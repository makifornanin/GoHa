import { ReviewView, type ReviewData } from "@/components/review/review-view";
import {
  focusRepo,
  goalsRepo,
  habitsRepo,
  lifeAreasRepo,
  reviewsRepo,
  tasksRepo,
} from "@/db";
import { addDays, startOfWeek, zonedToday } from "@/lib/date";
import { deriveReviewStats, weekBounds } from "@/lib/review";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Review" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const [{ timeZone, weekStartsOn }, { week }] = await Promise.all([
    getUserDatePrefs(user.id),
    searchParams,
  ]);

  const today = zonedToday(new Date(), timeZone);
  const currentWeekStart = startOfWeek(today, weekStartsOn);

  // A malformed or future `?week=` falls back to the current week rather than
  // rendering an empty page for a date that cannot exist.
  const requested = week && ISO_DATE.test(week) ? startOfWeek(week, weekStartsOn) : currentWeekStart;
  const weekStart = requested > currentWeekStart ? currentWeekStart : requested;
  const bounds = weekBounds(weekStart);

  const [tasks, habits, entries, sessions, goals, lifeAreas, review] = await Promise.all([
    tasksRepo.listTasksForUser(user.id),
    habitsRepo.listHabitsWithSchedule(user.id),
    habitsRepo.listEntriesInRange(user.id, { from: bounds.start, to: bounds.end }),
    focusRepo.listCompletedSessionsInRange(user.id, { from: bounds.start, to: bounds.end }),
    goalsRepo.listGoalsWithTaskCounts(user.id, { includeArchived: true }),
    lifeAreasRepo.listLifeAreas(user.id),
    reviewsRepo.getWeeklyReview(user.id, weekStart),
  ]);

  const stats = deriveReviewStats({
    week: bounds,
    tasks,
    habits,
    habitEntries: entries,
    sessions,
    goals,
    today,
    weekStartsOn,
    timeZone,
  });

  const data: ReviewData = {
    weekStart,
    weekEnd: bounds.end,
    prevWeekStart: addDays(weekStart, -7),
    // There is no "next" past the current week: a review of the future is not
    // a thing, and an enabled arrow that goes nowhere reads as broken.
    nextWeekStart: weekStart < currentWeekStart ? addDays(weekStart, 7) : null,
    isCurrentWeek: weekStart === currentWeekStart,
    stats,
    review,
    lifeAreas,
  };

  /*
   * `key={weekStart}` is load-bearing, not a lint appeasement (audit R-05).
   *
   * ReviewView seeds its prose and rating from props with useState, which runs
   * ONCE per mounted instance. Navigating weeks via ?week= re-renders the same
   * instance in the same tree position, so React keeps the old week's state
   * while `data.weekStart` becomes the new week. Saving then wrote last week's
   * reflection into this week's row, silently, over the top of whatever was
   * there.
   *
   * Keying on the week makes each week a distinct instance, so the state is
   * rebuilt from that week's own review.
   */
  return <ReviewView key={weekStart} data={data} />;
}
