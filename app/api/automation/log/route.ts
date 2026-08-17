import { automationRepo } from "@/db";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  finishAutomation,
  isFailure,
  withContext,
} from "@/lib/automation/request";
import { claimLogSchema } from "@/lib/validations/automation";

const ROUTE = "POST /api/automation/log";

export const dynamic = "force-dynamic";

/**
 * Claim a dedupe key before sending (automation Guide 00, dedupe scheme).
 *
 * The only write on the automation surface that is not the owner's own words,
 * and it writes nothing about their work: it records that a message went out.
 *
 *   201 { claimed: true }   you are first, send it
 *   409 { claimed: false }  someone already did, drop this item
 *
 * A 409 carries the winner's payload, so a re-run can re-serve exactly what was
 * sent the first time rather than composing a second, slightly different
 * version of the same message.
 *
 * Not gated by the Sabbath: the log records what happened, and a rest day
 * suppresses delivery rather than history. The endpoints that would generate
 * something to log are the ones that go quiet.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE, scope: "read_write" });
  if (isFailure(auth)) return auth.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson({ error: "Send a JSON body." }, { status: 400 }),
      );
    }

    const parsed = claimLogSchema.safeParse(body);
    if (!parsed.success) {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson(
          { error: parsed.error.issues[0]?.message ?? "Check the request body." },
          { status: 400 },
        ),
      );
    }

    // The date defaults to the OWNER's local today, not the caller's clock: an
    // automation platform running in UTC would otherwise file a 07:30 Manila
    // brief under yesterday (CLAUDE.md section 6).
    const localDate = parsed.data.localDate ?? auth.context.localDate;

    const claimed = await automationRepo.claimNotification(auth.userId, {
      kind: parsed.data.kind,
      dedupeKey: parsed.data.dedupeKey,
      localDate,
      entityType: parsed.data.entityType ?? null,
      entityId: parsed.data.entityId ?? null,
      payload: parsed.data.payload ?? null,
    });

    if (claimed) {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson(
          {
            claimed: true,
            kind: claimed.kind,
            dedupeKey: claimed.dedupeKey,
            localDate: claimed.localDate,
            sentAt: claimed.sentAt.toISOString(),
          },
          { status: 201 },
        ),
      );
    }

    const winner = await automationRepo.getNotification(auth.userId, parsed.data.dedupeKey);
    return await finishAutomation(
      auth,
      ROUTE,
      automationJson(
        {
          claimed: false,
          kind: parsed.data.kind,
          dedupeKey: parsed.data.dedupeKey,
          localDate,
          sentAt: winner?.sentAt.toISOString() ?? null,
          // What the winner sent, so a re-run re-serves it instead of writing
          // a second version of the same message.
          payload: winner?.payload ?? null,
        },
        { status: 409 },
      ),
    );
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}

/** Has this key been claimed? Cheap pre-check for a workflow that wants one. */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: "GET /api/automation/log" });
  if (isFailure(auth)) return auth.response;

  const key = new URL(request.url).searchParams.get("dedupeKey");
  if (!key) {
    return await finishAutomation(
      auth,
      "GET /api/automation/log",
      automationJson({ error: "Pass a dedupeKey." }, { status: 400 }),
    );
  }

  try {
    const entry = await automationRepo.getNotification(auth.userId, key);
    return await finishAutomation(
      auth,
      "GET /api/automation/log",
      withContext(auth, {
        dedupeKey: key,
        claimed: Boolean(entry),
        sentAt: entry?.sentAt.toISOString() ?? null,
        payload: entry?.payload ?? null,
      }),
    );
  } catch (error) {
    return automationError("GET /api/automation/log", error);
  }
}
