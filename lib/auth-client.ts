import { createAuthClient } from "better-auth/react";

/**
 * Browser auth client. Talks to the Better Auth route handler at `/api/auth/*`
 * on the same origin, so no baseURL is needed. Used by client components for
 * sign-in, sign-out, and the one-time owner bootstrap sign-up.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
