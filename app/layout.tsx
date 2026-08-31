import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/motion-config";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Inter v4 variable with the `opsz` optical-sizing axis: reproduces the
// SF Pro Display/Text crossover (spec section 3). SF Pro itself is not
// licensed for the web and must not be used.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

// Geist Mono for timers, durations, and counts (tabular figures).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GoHa",
    template: "%s | GoHa",
  },
  description:
    "GoHa: a personal execution system that connects your life areas, goals, habits, and daily action.",
  applicationName: "GoHa",
  icons: {
    icon: [
      { url: "/icons/goha-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/goha-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/goha-apple-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

// Browser-chrome color only (metadata, not styling): mirrors --canvas.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full bg-canvas text-label">
        <ServiceWorkerRegistrar />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MotionProvider>
            {children}
            {/*
              Top-CENTRE, which is the only band that is reliably empty.

              Two positions have now been ruled out by real use, in opposite
              directions. BOTTOM-right stacked toasts sat on Settings' selects
              and intercepted their clicks until they timed out. TOP-right then
              covered the page-header actions, because every page header puts
              its actions at the right: the Day Planner's Today/Tomorrow toggle
              and the goal detail Archive/Edit/Add row were both obscured.

              Page headers are title-left, actions-right, so the horizontal
              middle is the one part of that band with nothing in it. The top
              offset still clears the 56px app header.

              On a phone the header stacks and the toast is near full width, so
              it briefly overlays the page TITLE. That is deliberate: a title is
              not interactive, and the alternative bottom edge belongs to the
              tab bar and the "+" button.
            */}
            <Toaster
              position="top-center"
              duration={3500}
              offset={{ top: "72px" }}
              mobileOffset={{ top: "64px", left: "16px", right: "16px" }}
            />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
