import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPairingSessionByHash: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  pushRepo: { getPairingSessionByHash: mocks.getPairingSessionByHash },
}));

const { POST } = await import("@/app/api/push/pairing/stage/route");

function request(code: string) {
  return new Request("https://goha.example/api/push/pairing/stage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

describe("public pairing staging", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stages a usable code in an HttpOnly cookie without authenticating an account", async () => {
    const code = `goha_pair_${"A".repeat(43)}`;
    const now = Date.now();
    const secretHash = "f".repeat(64);
    mocks.getPairingSessionByHash.mockResolvedValue({
      secretHash,
      issuedAt: new Date(now - 1_000),
      expiresAt: new Date(now + 60_000),
      consumedAt: null,
    });

    const response = await POST(request(code));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`goha_push_pairing=${secretHash}`);
    expect(setCookie).not.toContain(code);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toMatch(/SameSite=lax/i);
  });

  it("uses one generic rejection for expired and malformed codes", async () => {
    mocks.getPairingSessionByHash.mockResolvedValue(null);
    const code = `goha_pair_${"B".repeat(43)}`;

    const expired = await POST(request(code));
    const malformed = await POST(request("not-a-code"));

    expect(expired.status).toBe(400);
    expect(malformed.status).toBe(400);
    await expect(expired.json()).resolves.toEqual({
      ok: false,
      error: "That pairing code is no longer available.",
    });
    await expect(malformed.json()).resolves.toEqual({
      ok: false,
      error: "That pairing code is no longer available.",
    });
  });
});
