import {
  Brain,
  Calendar,
  CalendarDays,
  Focus,
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
 * The single source of truth for the sidebar and mobile navigation.
 * Order and labels mirror the Stitch design (see docs/STITCH_AUDIT.md section 2).
 * Route slugs follow the CLAUDE.md naming (for example /tasks, labelled "To-dos").
 */
/**
 * Every entry here MUST lead to a working screen. That rule once kept Calendar,
 * Review and Progress out of the menu while they were placeholders, because a
 * quarter of the navigation leading to "coming soon" made the app feel broken.
 * All three are built now, so all three are listed.
 *
 * Order follows the conceptual chain (CLAUDE.md section 1): plan the day, aim
 * at goals, do the work, then look back at it.
 */
export const primaryNav: NavItem[] = [
  { label: "Today", href: "/today", icon: CalendarDays, stage: "mvp" },
  { label: "Goals", href: "/goals", icon: Trophy, stage: "mvp" },
  { label: "To-dos", href: "/tasks", icon: ListChecks, stage: "mvp" },
  { label: "Calendar", href: "/calendar", icon: Calendar, stage: "expansion" },
  { label: "Habits", href: "/habits", icon: Repeat, stage: "expansion" },
  { label: "Focus", href: "/focus", icon: Focus, stage: "expansion" },
  { label: "Brain Dump", href: "/brain-dump", icon: Brain, stage: "expansion" },
  { label: "Task Map", href: "/task-maps", icon: Waypoints, stage: "expansion" },
  { label: "Review", href: "/review", icon: NotebookPen, stage: "expansion" },
  { label: "Progress", href: "/progress", icon: TrendingUp, stage: "expansion" },
  { label: "Life Areas", href: "/life-areas", icon: Shapes, stage: "mvp" },
  { label: "Settings", href: "/settings", icon: Settings, stage: "mvp" },
];

/** Nothing is unbuilt any more; kept so a future surface has an obvious home. */
export const plannedNav: NavItem[] = [];

/** Looked up by href, not index, so reordering primaryNav can never break this. */
function navItem(href: string): NavItem {
  const item = primaryNav.find((entry) => entry.href === href);
  if (!item) throw new Error(`mobileNav references a missing route: ${href}`);
  return item;
}

/** The four destinations surfaced in the mobile bottom bar (plus the center action). */
export const mobileNav: NavItem[] = [
  navItem("/today"),
  navItem("/tasks"),
  navItem("/habits"),
  navItem("/settings"),
];
