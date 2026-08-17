import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { CONSTRAINTS, isUniqueViolation } from "@/lib/db-errors";

/**
 * Better Auth catch-all route handler. Runs on the Node.js runtime (the default
 * for route handlers) because password hashing uses node crypto. Middleware
 * excludes `/api/auth/*` so these requests are never redirected.
 */
const handlers = toNextJsHandler(auth.handler);

/**
 * Single-owner sign-up is refused twice over: `lib/auth.ts` checks before
 * creating, and `user_single_owner_uq` refuses a second row outright, which is
 * what settles two sign-ups arriving together (audit R-08).
 *
 * The database's refusal arrives here as an unhandled driver error, which would
 * reach the browser as a 500 quoting an index name. Translate it into the same
 * answer the check gives, so a race and an ordinary second attempt read
 * identically and nothing about the schema is published.
 */
function withSingleOwnerAnswer<T extends (request: Request) => Promise<Response>>(handler: T) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request);
    } catch (error) {
      if (isUniqueViolation(error, CONSTRAINTS.singleOwner)) {
        return Response.json(
          { message: "GoHa is a single-owner app. Sign-ups are closed." },
          { status: 403 },
        );
      }
      throw error;
    }
  };
}

export const GET = withSingleOwnerAnswer(handlers.GET);
export const POST = withSingleOwnerAnswer(handlers.POST);
