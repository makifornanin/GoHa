import { getDb } from "@/db";
import { authenticateAutomation, isFailure } from "@/lib/automation/request";

export const dynamic = "force-dynamic";

/** A hanging Neon connection must not hang the check itself (Guide 04, 1.2). */
const PROBE_TIMEOUT_MS = 3000;

/**
 * Liveness, and readiness for anyone holding a token.
 *
 * Two levels on purpose (automation Guide 04, phase 1):
 *
 *   unauthenticated  200 { status: "ok" }         safe for any uptime checker
 *   with a token     200 { status, db, latencyMs, version, time }
 *
 * ALWAYS 200 when the process answered, even with the database down. The
 * transport worked; the payload carries the truth. That distinction is the
 * whole basis of the n8n classifier: a non-200 means DOWN (nothing answered),
 * while 200 with `db: "fail"` means DEGRADED (the app is up, its database is
 * not). Returning 503 for a database blip would page the owner as though the
 * whole app had gone, and the two need different responses.
 *
 * Never counts, table names, or error text: this is public surface. Details go
 * to the server log, where only the owner reads them.
 *
 * Exempt from the Sabbath gate. Infrastructure failure does not keep a rest
 * day, and a database that dies on Saturday night should not wait until Sunday
 * to be noticed.
 */
export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };

  // The bare check: no auth, no data, no database. An uptime service pointed at
  // this is asking "is anything answering", and that is all it should learn.
  const auth = await authenticateAutomation(request, { route: "GET /api/health" });
  if (isFailure(auth)) {
    return Response.json({ status: "ok" }, { headers });
  }

  const started = Date.now();
  let db: "ok" | "fail" = "ok";

  try {
    await withTimeout(getDb().execute("select 1"), PROBE_TIMEOUT_MS);
  } catch (error) {
    console.error("health probe failed", error);
    db = "fail";
  }

  return Response.json(
    {
      status: db === "ok" ? "ok" : "degraded",
      db,
      latencyMs: Date.now() - started,
      version: process.env.npm_package_version ?? "0.1.0",
      time: new Date().toISOString(),
    },
    { headers },
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`probe exceeded ${ms}ms`)), ms),
    ),
  ]);
}
