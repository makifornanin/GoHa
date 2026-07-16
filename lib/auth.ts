import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { db, schema, usersRepo } from "@/db";

/**
 * Better Auth server instance (email/password, Drizzle adapter on Neon).
 *
 * Design decisions (CLAUDE.md sections 1, 5, 8):
 *  - Single-owner app. Public sign-up is closed: the owner account is created
 *    once via the bootstrap flow, and the `user.create.before` hook then refuses
 *    any further account creation, even against the raw endpoint.
 *  - IDs are UUIDs (`generateId: "uuid"`) so app-issued and DB-default ids never
 *    diverge from the schema's `uuid` primary keys.
 *  - `transaction: false`: the Neon HTTP driver is stateless and does not support
 *    interactive transactions; Better Auth then runs its operations sequentially.
 *  - Identity is always derived from the session server-side; the client never
 *    supplies a user id.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
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
  databaseHooks: {
    user: {
      create: {
        // Enforce single-owner at the data layer: only the very first account
        // (the owner) may ever be created. This closes sign-up permanently once
        // bootstrapped, regardless of how the endpoint is reached.
        before: async () => {
          if (await usersRepo.hasAnyUser()) {
            throw new APIError("FORBIDDEN", {
              message: "GoHa is a single-owner app. Sign-ups are closed.",
            });
          }
        },
      },
    },
  },
  // Must be the last plugin: lets Server Actions set Better Auth cookies.
  plugins: [nextCookies()],
});
