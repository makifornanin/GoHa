import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db, schema } from "@/db";

/**
 * Where this app answers from.
 *
 * Better Auth checks the request Origin against its base URL and refuses
 * anything else with "Invalid origin". Deriving that from a single hand-set
 * environment variable is fragile: on Vercel the production host, every preview
 * host and localhost are all legitimate, and one stale value locks the owner out
 * of their own sign-in page with an error that names nothing useful.
 *
 * So the list is assembled from what the platform already knows.
 * `VERCEL_PROJECT_PRODUCTION_URL` is the stable production host and
 * `VERCEL_URL` is this particular deployment, both injected by Vercel; neither
 * exists locally, where localhost applies instead.
 */
function vercelUrl(value: string | undefined): string | null {
  if (!value) return null;
  return value.startsWith("http") ? value : `https://${value}`;
}

const PRODUCTION_URL = vercelUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL);
const DEPLOYMENT_URL = vercelUrl(process.env.VERCEL_URL);

/** The canonical base. An explicit setting still wins if one is given. */
const BASE_URL = process.env.BETTER_AUTH_URL || PRODUCTION_URL || undefined;

function trustedOrigins(): string[] {
  const origins = new Set<string>();
  for (const origin of [process.env.BETTER_AUTH_URL, PRODUCTION_URL, DEPLOYMENT_URL]) {
    if (origin) origins.add(origin.replace(/\/$/, ""));
  }
  // Development, where none of the platform variables exist.
  if (!PRODUCTION_URL) origins.add("http://localhost:3000");
  return [...origins];
}

/**
 * Better Auth server instance (email/password, Drizzle adapter on Neon).
 *
 * Design decisions (CLAUDE.md sections 5 and 8):
 *  - IDs are UUIDs (`generateId: "uuid"`) so app-issued and DB-default ids never
 *    diverge from the schema's `uuid` primary keys.
 *  - `transaction: false`: the Neon HTTP driver is stateless and does not support
 *    interactive transactions; Better Auth then runs its operations sequentially.
 *  - Identity is always derived from the session server-side; the client never
 *    supplies a user id.
 *
 * Sign-up is NOT closed here any more. It is gated by invitation in the route
 * handler (`app/api/auth/[...all]/route.ts`), which is the only path any
 * sign-up request can take, including a direct call to the raw endpoint.
 */
export const auth = betterAuth({
  baseURL: BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: trustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "pg",
    transaction: false,
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  // Must be the last plugin: lets Server Actions set Better Auth cookies.
  plugins: [nextCookies()],
});
