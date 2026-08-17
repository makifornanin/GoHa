import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * `'unsafe-inline'` for styles is load-bearing rather than lazy: Tailwind v4
 * and the motion library both set inline styles, and React itself injects a
 * style attribute for anything animated. Scripts are stricter, but Next's
 * hydration bootstrap is an inline script, so it needs `'unsafe-inline'` too
 * until a nonce is threaded through the app; a policy that breaks the app is
 * worse than an honest one that does not, so this says what it actually is.
 *
 * `connect-src 'self'` is the line that matters most for this app: nothing here
 * is supposed to talk to a third party, and the automation surface is
 * inbound-only. `frame-ancestors 'none'` and `form-action 'self'` close the
 * clickjacking and form-relay routes to a single-owner app's session.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing in GoHa uses a camera, microphone or location. Say so, so a future
  // dependency cannot quietly start asking.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Only meaningful over HTTPS; harmless on localhost, and the deployment this
  // is heading for is HTTPS-only.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Turbopack does not infer it from
  // an unrelated parent lockfile.
  turbopack: {
    root: import.meta.dirname,
  },
  // Nothing gains from announcing the framework and version to every caller.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // The automation surface is machine-to-machine and must never be
        // cached by anything in between: it is one owner's live state.
        source: "/api/automation/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
