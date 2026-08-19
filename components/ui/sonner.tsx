"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import type { CSSProperties } from "react";

/**
 * Theme-aware Sonner toaster. Toasts are SOLID surfaces (glass is chrome-only
 * per spec section 5): `surface` background, opaque separator border,
 * radius 12, shadow e3.
 */
export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      /*
       * A dismiss button on every toast.
       *
       * Toasts here carry undo actions and error text, so they linger; without
       * a way to close one, the only options were to wait it out or to work
       * around it. Sonner only shows this on hover by default, which is no help
       * on a touch screen, so it is forced visible below.
       */
      closeButton
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-separator-opaque shadow-e3",
          title: "text-callout font-medium",
          description: "text-callout",
          closeButton:
            "!opacity-100 !bg-surface !border-separator-opaque !text-label-secondary hover:!text-label hover:!bg-surface-hover !transition-colors",
        },
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--label)",
          "--normal-border": "var(--separator-opaque)",
          "--border-radius": "12px",
        } as CSSProperties
      }
      {...props}
    />
  );
}
