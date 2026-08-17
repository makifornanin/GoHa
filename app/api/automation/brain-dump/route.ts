import { brainDumpRepo } from "@/db";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  finishAutomation,
  isFailure,
} from "@/lib/automation/request";
import { brainDumpCaptureSchema } from "@/lib/validations/automation";

const ROUTE = "POST /api/automation/brain-dump";

export const dynamic = "force-dynamic";

/**
 * Capture a thought from outside the app: Siri, a Shortcut, a widget.
 *
 * The one place an automation adds to the owner's own records, and it is the
 * right exception: capturing a thought is not work, and losing one is. It goes
 * into the Brain Dump inbox exactly as typing it into the app would, with the
 * same Zod bound, so nothing arrives here that the app itself would refuse.
 *
 * Deliberately NOT Sabbath-gated (Guide 07, step 2.2). Rest suppresses what the
 * system says to you, not what you can hand to it; a thought that arrives on a
 * rest day should still be caught rather than dropped.
 *
 * It cannot create a task, complete anything, or convert the item. Conversion
 * stays a decision made in the app.
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

    const parsed = brainDumpCaptureSchema.safeParse(body);
    if (!parsed.success) {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson(
          { error: parsed.error.issues[0]?.message ?? "Check the request body." },
          { status: 422 },
        ),
      );
    }

    const item = await brainDumpRepo.createBrainDumpItem(auth.userId, parsed.data.content);

    return await finishAutomation(
      auth,
      ROUTE,
      automationJson(
        { id: item.id, content: item.content, capturedAt: item.createdAt.toISOString() },
        { status: 201 },
      ),
    );
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
