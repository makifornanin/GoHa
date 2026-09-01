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
              BOTTOM-CENTRE: out of the reading path, and off the right rail.

              Three positions have now been ruled out by real use. BOTTOM-RIGHT
              stacked toasts sat on Settings' selects and intercepted their
              clicks until they timed out. TOP-RIGHT covered the page-header
              actions, because every page header puts its actions at the right.
              TOP-CENTRE then dropped a panel into the middle of whatever the
              reader was looking at, which is where this one came from.

              The pattern in those three is structural rather than accidental:
              GoHa right-aligns its actions (page headers, card footers, the
              planner's commit bar, every select), so the right rail is never
              safe, and the top band is where the page names itself. That leaves
              the bottom centre, which is also where a notification of this kind
              is conventionally looked for.

              The stack is capped and kept collapsed so a burst of toasts can
              never grow into a column tall enough to reach a control, which was
              the actual mechanism of the bottom-right failure rather than the
              corner itself.

              On a phone the toast is near full width and is lifted clear of the
              tab bar and its "+" button, so the primary navigation is never
              covered.
            */}
            <Toaster
              position="bottom-center"
              duration={3500}
              visibleToasts={3}
              expand={false}
              offset={{ bottom: "24px" }}
              mobileOffset={{
                bottom: "calc(76px + env(safe-area-inset-bottom))",
                left: "16px",
                right: "16px",
              }}
            />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
