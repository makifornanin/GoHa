import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/motion-config";
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MotionProvider>
            {children}
            <Toaster position="bottom-right" />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
