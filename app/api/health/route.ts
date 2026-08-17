import { getDb } from "@/db";

/**
 * Liveness and readiness, for a deploy platform or an uptime check.
 *
 * Unauthenticated on purpose, and therefore deliberately dull: it answers
 * whether the process is up and whether it can reach the database, and nothing
 * else. No version, no host, no migration state, no counts. A health endpoint
 * is the most-called URL a deployment has, and the one most likely to be
 * pointed at by something the owner does not control (audit R-16).
 *
 * 200 means the app can serve requests. 503 means it cannot, which is what a
 * load balancer needs in order to stop sending traffic.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const started = Date.now();

  try {
    // The cheapest query that proves a real round trip, not just a pool object.
    await getDb().execute("select 1");
    return Response.json(
      { status: "ok", database: "ok", latencyMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Logged in full here, reported as one word to the caller: the reason a
    // database is unreachable is not a stranger's business.
    console.error("health check failed", error);
    return Response.json(
      { status: "degraded", database: "unreachable", latencyMs: Date.now() - started },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
