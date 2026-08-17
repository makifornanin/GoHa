import {
  authenticateAutomation,
  automationJson,
  finishAutomation,
  isFailure,
} from "@/lib/automation/request";
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS } from "@/lib/automation/rate-limit";

const ROUTE = "GET /api/automation";

/**
 * Does this token work, and what can it reach?
 *
 * The guide's phase 0 insists on testing the push channel before building
 * anything on it. This is the same idea from the other end: one call that
 * proves the credential is wired up, without needing to understand any of the
 * data endpoints first. It is also what the Test button in Settings calls.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE });
  if (isFailure(auth)) return auth.response;

  return await finishAutomation(
    auth,
    ROUTE,
    automationJson({
      ok: true,
      token: { name: auth.token.name, scope: auth.token.scope },
      rateLimit: { max: RATE_LIMIT_MAX, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
      endpoints: [
        { method: "GET", path: "/api/automation", scope: "read", description: "This check." },
        {
          method: "GET",
          path: "/api/automation/brief",
          scope: "read",
          description: "The day's brief: the same judgement the Today screen shows.",
        },
        {
          method: "GET",
          path: "/api/automation/habits",
          scope: "read",
          description: "Habits still open today, and the streaks at risk.",
        },
        {
          method: "POST",
          path: "/api/automation/deliveries",
          scope: "read_write",
          description: "Claim (kind, date) once, so a flow that runs twice sends once.",
        },
      ],
    }),
  );
}
