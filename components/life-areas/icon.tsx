import {
  BookOpen,
  Bot,
  Briefcase,
  Camera,
  Car,
  Dumbbell,
  Feather,
  Flag,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Languages,
  Leaf,
  Lightbulb,
  ListChecks,
  Moon,
  Music,
  NotebookPen,
  PawPrint,
  Palette,
  PiggyBank,
  Plane,
  Repeat,
  Rocket,
  Salad,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Store,
  Sun,
  Target,
  TentTree,
  TrendingUp,
  Code2,
  CalendarRange,
  Users,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { toIconKey, type LifeAreaIconKey } from "@/lib/life-areas";

/**
 * Stable icon keys to lucide components.
 *
 * Explicit rather than a dynamic lookup so the bundler can tree-shake, and so
 * a key that loses its glyph fails at build time instead of rendering nothing.
 * One family throughout: every entry here is lucide, which is what the rest of
 * GoHa draws from.
 */
export const lifeAreaIconMap: Record<LifeAreaIconKey, LucideIcon> = {
  // Work
  briefcase: Briefcase,
  business: Store,
  code: Code2,
  automation: Bot,
  projects: Rocket,
  meeting: Users,
  // Learning
  growth: GraduationCap,
  school: BookOpen,
  reading: BookOpen,
  language: Languages,
  science: FlaskConical,
  // Money
  wallet: Wallet,
  savings: PiggyBank,
  investing: TrendingUp,
  shopping: ShoppingBag,
  // Body
  heart: Heart,
  fitness: Dumbbell,
  food: Salad,
  sleep: Moon,
  outdoors: TentTree,
  medical: Stethoscope,
  // People
  family: Users,
  relationships: Heart,
  friends: UserRound,
  pets: PawPrint,
  // Life
  home: Home,
  travel: Plane,
  car: Car,
  leaf: Leaf,
  globe: Globe,
  // Making
  creativity: Lightbulb,
  music: Music,
  writing: Feather,
  photo: Camera,
  design: Palette,
  // Inner
  spirituality: Sun,
  mindfulness: Sparkles,
  sparkles: Sparkles,
  journal: NotebookPen,
  // Planning
  target: Target,
  planning: CalendarRange,
  routines: Repeat,
  habits: ListChecks,
  rocket: Rocket,
  milestone: Flag,
};

/** Renders the icon for a (possibly unknown) stored key, with a safe fallback. */
export function LifeAreaIcon({
  iconKey,
  className,
}: {
  iconKey: string | null | undefined;
  className?: string;
}) {
  const Icon = lifeAreaIconMap[toIconKey(iconKey)];
  return <Icon className={className} aria-hidden />;
}
