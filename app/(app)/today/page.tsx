import { DateRolloverRefresh } from "@/components/date-rollover-refresh";
import { TodayView } from "@/components/today/today-view";
import type { MomentumData } from "@/components/today/momentum-card";
import {
  dailyPrioritiesRepo,
  focusRepo,
  goalsRepo,
  habitsRepo,
  lifeAreasRepo,
  tasksRepo,
} from "@/db";
import {
  addDays,
  formatManilaLongDate,
  getZonedParts,
  zonedPartOfDay,
  zonedToday,
} from "@/lib/date";
import { getDailyInspiration } from "@/lib/inspiration/daily";
import { resolveRestDayQuote } from "@/lib/inspiration/rest-quote";
import { buildHabitViews } from "@/lib/habit-view";
import { completionsByDay } from "@/lib/progress";
import { isSabbathDate, SABBATH_MESSAGE } from "@/lib/sabbath";
import { requireUser } from "@/lib/session";
import { getUserSettingsCached } from "@/lib/user-settings";

export const metadata = { title: "Today" };

/** Two weeks: this week's sparkline plus the week before it to compare against. */
const MOMENTUM_DAYS = 14;

export default async function TodayPage() {
  // Identity from the session; every query below is user-scoped in the repos.
  const user = await requireUser();
  const settings = await getUserSettingsCached(user.id);
  const timeZone = settings.timezone;
  const weekStartsOn = settings.weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  const now = new Date();
  const today = zonedToday(now, timeZone);
  const momentumFrom = addDays(today, -(MOMENTUM_DAYS - 1));

  const [tasks, subtasks, goals, priorities, habits, habitEntries, lifeAreas, focusSessions] =
    await Promise.all([
      tasksRepo.listTasksForUser(user.id),
      tasksRepo.listSubtasksForUser(user.id),
      goalsRepo.listGoalsWithTaskCounts(user.id),
      dailyPrioritiesRepo.listDailyPriorities(user.id, today),
      habitsRepo.listHabitsWithSchedule(user.id),
      // A wider window than today alone: streaks and the momentum sparkline
      // need history, and today's check-in list is derived from the same rows.
      habitsRepo.listEntriesInRange(user.id, { from: addDays(today, -400), to: today }),
      // Life areas carry the colour that everything below them inherits.
      lifeAreasRepo.listLifeAreas(user.id),
      focusRepo.listCompletedSessionsInRange(user.id, { from: momentumFrom, to: today }),
    ]);

  /*
   * The rest day, and the day's quote.
   *
   * The quote is picked from the same deterministic rule the automation
   * endpoint uses, so the card and the morning notification cannot show
   * different quotes on the same morning. On the Sabbath the pool narrows to
   * rest-themed entries, falling back to the ordinary pool rather than showing
   * nothing (Guide 07, step 3.1).
   */
  const isSabbath = isSabbathDate(settings.sabbathDay, today);

  /*
   * The rest-day quote, through the SAME resolver the Sabbath worker job uses,
   * so the banner here and the rest-day notification cannot disagree. Only
   * loaded on a rest day: on an ordinary day the Daily Inspiration below is
   * what the page shows.
   */
  const picked = isSabbath
    ? await resolveRestDayQuote(user.id, today, settings.quoteSourcePref)
    : null;
  const quote = picked
    ? { text: picked.text, attribution: picked.attribution, translation: picked.translation }
    : null;

  /*
   * The canonical Daily Inspiration for this user's local date.
   *
   * Read-through: the first caller on a new local date decides and stores it,
   * everyone after reads that row. Whether that first caller is this page or
   * the worker preparing the morning job does not matter, which is the point:
   * the card below and the Morning Brief payload are the same record.
   *
   * Skipped entirely on a rest day. The Sabbath banner already carries a
   * rest-themed line, and resolving here would spend a provider call on
   * something this page will not render.
   */
  const inspiration = isSabbath ? null : await getDailyInspiration(user.id, today);

  // --- Momentum, derived from records already written elsewhere ---
  const views = buildHabitViews({ habits, entries: habitEntries, today, weekStartsOn, timeZone });
  const bestCurrent = views.reduce(
    (best, v) => (v.streaks.current > best.days ? { days: v.streaks.current, name: v.habit.name } : best),
    { days: 0, name: null as string | null },
  );

  const daily = completionsByDay({ tasks, from: momentumFrom, to: today, timeZone });
  const weekCompletions = daily.slice(-7).map((d) => d.value);
  const weekTotal = weekCompletions.reduce((sum, v) => sum + v, 0);
  const prevWeekTotal = daily.slice(0, 7).reduce((sum, d) => sum + d.value, 0);

  let focusSecondsToday = 0;
  let focusSecondsWeek = 0;
  const weekStart = addDays(today, -6);
  for (const session of focusSessions) {
    const seconds = session.durationSeconds ?? 0;
    if (seconds <= 0) continue;
    if (session.sessionDate >= weekStart) focusSecondsWeek += seconds;
    if (session.sessionDate === today) focusSecondsToday += seconds;
  }

  const momentum: MomentumData = {
    streakDays: bestCurrent.days,
    streakHabit: bestCurrent.days > 0 ? bestCurrent.name : null,
    weekCompletions,
    weekTotal,
    prevWeekTotal,
    focusSecondsToday,
    focusSecondsWeek,
  };

  // Today's habit check-ins read from the same wide entry set, filtered locally.
  const todaysEntries = habitEntries.filter((e) => e.entryDate === today);

  return (
    <>
      {/* "today" is resolved here, on the server. Without this a tab left open
          past midnight keeps rendering yesterday's dashboard. */}
      <DateRolloverRefresh today={today} timeZone={timeZone} />
      <TodayView
        userName={user.name.split(" ")[0] || user.name}
        greetingPart={zonedPartOfDay(now, timeZone)}
        dateLabel={formatManilaLongDate(today) ?? ""}
        today={today}
        timeZone={timeZone}
        hour={getZonedParts(now, timeZone).hour}
        tasks={tasks}
        subtasks={subtasks}
        goals={goals}
        priorities={priorities}
        habits={habits}
        habitEntries={todaysEntries}
        allHabitEntries={habitEntries}
        weekStartsOn={weekStartsOn}
        lifeAreas={lifeAreas}
        momentum={momentum}
        quote={quote}
        inspiration={
          inspiration
            ? {
                type: inspiration.type,
                text: inspiration.text,
                source: inspiration.source,
                translation: inspiration.translation,
                provider: inspiration.provider,
              }
            : null
        }
        sabbath={isSabbath ? { message: SABBATH_MESSAGE } : null}
      />
    </>
  );
}
