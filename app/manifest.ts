import type { MetadataRoute } from "next";

/**
 * Install metadata for the Home Screen app.
 *
 * These URLs are deliberately static public assets. Besides avoiding runtime
 * work, that keeps manifest and icon requests outside the authenticated app
 * shell so an operating system can fetch them before the user signs in.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GoHa",
    short_name: "GoHa",
    description:
      "A personal execution system for goals, habits, focus, and daily action.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    categories: ["productivity", "lifestyle"],
    icons: [
      {
        src: "/icons/goha-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/goha-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/goha-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
