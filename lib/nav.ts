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
export const primaryNav: NavItem[] = [
  { label: "Today", href: "/today", icon: CalendarDays, stage: "mvp" },
  { label: "Goals", href: "/goals", icon: Trophy, stage: "mvp" },
  { label: "To-dos", href: "/tasks", icon: ListChecks, stage: "mvp" },
  { label: "Task Map", href: "/task-maps", icon: Waypoints, stage: "expansion" },
  { label: "Focus", href: "/focus", icon: Focus, stage: "expansion" },
  { label: "Habits", href: "/habits", icon: Repeat, stage: "expansion" },
  { label: "Calendar", href: "/calendar", icon: Calendar, stage: "expansion" },
  { label: "Brain Dump", href: "/brain-dump", icon: Brain, stage: "expansion" },
  { label: "Life Areas", href: "/life-areas", icon: Shapes, stage: "mvp" },
  { label: "Review", href: "/review", icon: NotebookPen, stage: "expansion" },
  { label: "Progress", href: "/progress", icon: TrendingUp, stage: "expansion" },
  { label: "Settings", href: "/settings", icon: Settings, stage: "mvp" },
];

/** The four destinations surfaced in the mobile bottom bar (plus the center action). */
export const mobileNav: NavItem[] = [
  primaryNav[0], // Today
  primaryNav[2], // To-dos
  primaryNav[6], // Calendar
  primaryNav[11], // Settings
];
