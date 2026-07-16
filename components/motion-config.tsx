"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Global motion configuration. `reducedMotion="user"` makes every motion
 * component respect the OS "reduce motion" setting (transforms and layout
 * animations collapse to instant, opacity is preserved), complementing the CSS
 * fallback in globals.css. This provider only configures behavior; it renders no
 * DOM and does not force its children onto the client.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
