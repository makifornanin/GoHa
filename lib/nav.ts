import {
  Brain,
  Calendar,
  CalendarDays,
  Focus,
  Hourglass,
  ListChecks,
  NotebookPen,
  Repeat,
  Settings,
  Shapes,
  TrendingUp,
  Trophy,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export type NavStage = "mvp" | "expansion";

/** Minimal, serializable user shape passed from the server layout to the shell. */
export type NavUser = {
  name: string;
  email: string;
  image?: string | null;
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Which build stage delivers this surface (see docs/BUILD_PLAN.md). */
  stage: NavStage;
};

/**
 * Every destination, flat. The single source of truth for both navigations:
 * `navGroups` below arranges these, and `mobileNav` picks four of them, so a
 * label or route is written exactly once.
 *
 * Every entry here MUST lead to a working screen. That rule once kept Calendar,
 * Review and Progress out of the menu while they were placeholders, because a
 * quarter of the navigation leading to "coming soon" made the app feel broken.
 *
 * Route slugs follow the CLAUDE.md naming; the LABEL and the slug are allowed
 * to differ where history demands it (`/tasks` is labelled "To-dos", because
 * the table is `tasks` and the product word is To-do, and renaming a live route
 * would break saved links and every notification URL already delivered).
 */
export const primaryNav: NavItem[] = [
  { label: "Today", href: "/today", icon: CalendarDays, stage: "mvp" },
  { label: "Day Planner", href: "/planner", icon: Hourglass, stage: "expansion" },
  { label: "Goals", href: "/goals", icon: Trophy, stage: "mvp" },
  { label: "To-dos", href: "/tasks", icon: ListChecks, stage: "mvp" },
  { label: "Calendar", href: "/calendar", icon: Calendar, stage: "expansion" },
  { label: "Life Areas", href: "/life-areas", icon: Shapes, stage: "mvp" },
  { label: "Habits", href: "/habits", icon: Repeat, stage: "expansion" },
  { label: "Focus", href: "/focus", icon: Focus, stage: "expansion" },
  { label: "Task Map", href: "/task-maps", icon: Waypoints, stage: "expansion" },
  { label: "Brain Dump", href: "/brain-dump", icon: Brain, stage: "expansion" },
  { label: "Progress", href: "/progress", icon: TrendingUp, stage: "expansion" },
  { label: "Review", href: "/review", icon: NotebookPen, stage: "expansion" },
  { label: "Settings", href: "/settings", icon: Settings, stage: "mvp" },
];

export type NavGroup = { label: string; items: NavItem[] };

/** Looked up by href, not index, so reordering primaryNav can never break this. */
function navItem(href: string): NavItem {
  const item = primaryNav.find((entry) => entry.href === href);
  if (!item) throw new Error(`nav references a missing route: ${href}`);
  return item;
}

/**
 * The menu, grouped by what the user is DOING.
 *
 * Twelve equal links in one column was the honest shape of the app while it was
 * being built, and it is the wrong shape for reading it: nothing in that list
 * says Focus is where a To-do gets worked on, or that Review reads back what
 * Today recorded. A newcomer met an inventory of features and had to infer the
 * product from it.
 *
 * Four groups, named as VERBS, spell out the loop the app is built around:
 * plan it, do it, capture it, look back at it. Settings sits outside them
 * because it is not a step in that loop.
 *
 * Deliberately one level deep. Collapsible sub-menus would hide destinations
 * behind a click to save vertical space the sidebar already has, and on a phone
 * they turn every navigation into two taps.
 */
export const navGroups: NavGroup[] = [
  {
    label: "Plan",
    items: [navItem("/today"), navItem("/planner"), navItem("/goals"), navItem("/tasks"), navItem("/calendar"), navItem("/life-areas")],
  },
  { label: "Do", items: [navItem("/habits"), navItem("/focus"), navItem("/task-maps")] },
  { label: "Capture", items: [navItem("/brain-dump")] },
  { label: "Review", items: [navItem("/progress"), navItem("/review")] },
  { label: "Account", items: [navItem("/settings")] },
];

/** Nothing is unbuilt any more; kept so a future surface has an obvious home. */
export const plannedNav: NavItem[] = [];

/**
 * The four destinations in the mobile tab bar, plus the centre "+".
 *
 * The bar is the whole navigation for someone who never opens the drawer, so it
 * carries one destination per phase of the loop rather than four from the same
 * one: plan the day, choose what fits, build the habit, look back.
 */
export const mobileNav: NavItem[] = [
  navItem("/today"),
  navItem("/planner"),
  navItem("/tasks"),
  navItem("/habits"),
];
