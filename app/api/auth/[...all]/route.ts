import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

/**
 * Better Auth catch-all route handler. Runs on the Node.js runtime (the default
 * for route handlers) because password hashing uses node crypto. Middleware
 * excludes `/api/auth/*` so these requests are never redirected.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
