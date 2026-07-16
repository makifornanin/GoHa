import {
  Briefcase,
  Dumbbell,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Leaf,
  Rocket,
  Sparkles,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { toIconKey, type LifeAreaIconKey } from "@/lib/life-areas";

/** Maps stable icon keys to lucide components (explicit for tree-shaking). */
export const lifeAreaIconMap: Record<LifeAreaIconKey, LucideIcon> = {
  target: Target,
  briefcase: Briefcase,
  heart: Heart,
  wallet: Wallet,
  growth: GraduationCap,
  family: Users,
  rocket: Rocket,
  home: Home,
  fitness: Dumbbell,
  sparkles: Sparkles,
  leaf: Leaf,
  globe: Globe,
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
