import "server-only";

/** A canonical origin for QR setup links. Never trusts request Host headers. */
export function getCanonicalAppOrigin(): string {
  const raw =
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.NODE_ENV === "production"
        ? ""
        : "http://localhost:3000");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("A valid BETTER_AUTH_URL is required to create a pairing link.");
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("BETTER_AUTH_URL must use HTTPS outside local development.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("BETTER_AUTH_URL must be a plain application origin.");
  }
  return url.origin;
}
