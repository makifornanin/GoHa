import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  hasAnyUser: vi.fn(),
  getSignupMode: vi.fn(),
  isOwner: vi.fn(),
  claimWelcomeEmail: vi.fn(),
  findInvitesByPrefix: vi.fn(),
  claimInvite: vi.fn(),
  acceptInvite: vi.fn(),
  releaseInvite: vi.fn(),
  releaseWelcomeEmailClaim: vi.fn(),
  send: vi.fn(),
  buildWelcomeEmailEvent: vi.fn(),
  authGET: vi.fn(),
  authPOST: vi.fn(),
}));

vi.mock("@/db", () => ({
  usersRepo: { hasAnyUser: mocks.hasAnyUser },
  appSettingsRepo: { getSignupMode: mocks.getSignupMode, isOwner: mocks.isOwner },
  invitesRepo: {
    findInvitesByPrefix: mocks.findInvitesByPrefix,
    claimInvite: mocks.claimInvite,
    acceptInvite: mocks.acceptInvite,
    releaseInvite: mocks.releaseInvite,
  },
  settingsRepo: {
    claimWelcomeEmail: mocks.claimWelcomeEmail,
    releaseWelcomeEmailClaim: mocks.releaseWelcomeEmailClaim,
  },
}));

vi.mock("@/lib/email-automation/n8n-email-events", () => ({
  emailEventSender: () => ({
    send: mocks.send,
    buildWelcomeEmailEvent: mocks.buildWelcomeEmailEvent,
    buildPasswordResetEvent: vi.fn(),
  }),
}));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ GET: mocks.authGET, POST: mocks.authPOST }),
}));

vi.mock("@/lib/auth", () => ({ auth: { handler: vi.fn() } }));

vi.mock("@/lib/invite", () => ({
  hashInviteCode: (code: string) => `hash:${code}`,
  normalizeInviteCode: (code: string) => code.trim(),
  inviteCodePrefix: (code: string) => code.slice(0, 6),
  inviteHashesMatch: (a: string, b: string) => a === b,
  inviteState: () => "usable",
}));

const { POST } = await import("@/app/api/auth/[...all]/route");

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "new@example.com",
  name: "Nanin",
};

function authRequest(path: string, body: unknown): Request {
  return new Request(`https://goha.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function created(user: unknown = USER): Response {
  return Response.json({ user }, { status: 200 });
}

/**
 * The welcome email fires on account CREATION and nothing else.
 *
 * The distinction is the whole feature. A hook on session creation would send
 * one on every sign-in and every new device, which is the failure the owner
 * explicitly did not want, so the trigger lives on the one route that can tell
 * the difference: a successful POST to /sign-up/email that returned a user.
 */
describe("welcome email dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No accounts yet: the bootstrap path, so the invite gate lets sign-up
    // through without needing an invitation.
    mocks.hasAnyUser.mockResolvedValue(false);
    mocks.getSignupMode.mockResolvedValue("open");
    mocks.claimWelcomeEmail.mockResolvedValue(true);
    mocks.send.mockResolvedValue({ delivered: true });
    mocks.buildWelcomeEmailEvent.mockImplementation((input: unknown) => ({
      eventType: "welcome_email",
      eventId: "event-1",
      ...(input as Record<string, unknown>),
    }));
  });

  it("emits exactly one event when a new account is created", async () => {
    mocks.authPOST.mockResolvedValue(created());

    await POST(authRequest("/api/auth/sign-up/email", { email: USER.email, password: "x".repeat(12) }));

    expect(mocks.claimWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.buildWelcomeEmailEvent).toHaveBeenCalledWith({
      recipientEmail: "new@example.com",
      displayName: "Nanin",
    });
  });

  it("uses the newly created account's own address, not the request body's", async () => {
    // The body is attacker-controlled; the response is what Better Auth
    // actually created.
    mocks.authPOST.mockResolvedValue(created());

    await POST(
      authRequest("/api/auth/sign-up/email", {
        email: "attacker@example.com",
        password: "x".repeat(12),
      }),
    );

    expect(mocks.buildWelcomeEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "new@example.com" }),
    );
  });

  it("does NOT emit on sign-in", async () => {
    mocks.authPOST.mockResolvedValue(created());

    await POST(authRequest("/api/auth/sign-in/email", { email: USER.email, password: "x".repeat(12) }));

    expect(mocks.claimWelcomeEmail).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does NOT emit when a session is created on another device", async () => {
    mocks.authPOST.mockResolvedValue(Response.json({ session: { id: "s1" }, user: USER }));

    await POST(authRequest("/api/auth/sign-in/email", { email: USER.email, password: "x".repeat(12) }));

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does NOT emit when sign-up fails", async () => {
    mocks.authPOST.mockResolvedValue(Response.json({ message: "nope" }, { status: 400 }));

    await POST(authRequest("/api/auth/sign-up/email", { email: USER.email, password: "short" }));

    expect(mocks.claimWelcomeEmail).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends nothing a second time when the claim is already taken", async () => {
    // The durable guard: a retried sign-up finds the timestamp already set and
    // the database refuses the claim, so nobody is welcomed twice.
    mocks.claimWelcomeEmail.mockResolvedValue(false);
    mocks.authPOST.mockResolvedValue(created());

    await POST(authRequest("/api/auth/sign-up/email", { email: USER.email, password: "x".repeat(12) }));

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("releases the claim when the handoff fails, so a retry can still welcome them", async () => {
    mocks.send.mockResolvedValue({ delivered: false, reason: "network_error" });
    mocks.authPOST.mockResolvedValue(created());

    await POST(authRequest("/api/auth/sign-up/email", { email: USER.email, password: "x".repeat(12) }));

    expect(mocks.releaseWelcomeEmailClaim).toHaveBeenCalledTimes(1);
    expect(mocks.releaseWelcomeEmailClaim).toHaveBeenCalledWith(USER.id, expect.any(Date));
  });

  it("keeps the claim when delivery succeeded", async () => {
    mocks.authPOST.mockResolvedValue(created());

    await POST(authRequest("/api/auth/sign-up/email", { email: USER.email, password: "x".repeat(12) }));

    expect(mocks.releaseWelcomeEmailClaim).not.toHaveBeenCalled();
  });

  it("still returns the created account when the email layer throws", async () => {
    // An account that exists must not be reported as a failure because a
    // workflow is unreachable.
    mocks.claimWelcomeEmail.mockRejectedValue(new Error("db down"));
    mocks.authPOST.mockResolvedValue(created());

    const response = await POST(
      authRequest("/api/auth/sign-up/email", { email: USER.email, password: "x".repeat(12) }),
    );

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toMatchObject({ user: { id: USER.id } });
  });

  it("welcomes an invited account, where the response is read twice", async () => {
    /*
     * The realistic production path, and the one the bootstrap tests above do
     * NOT reach.
     *
     * With an invitation in flight, `settleClaim` reads the response to record
     * which account the invite produced, and the welcome hook reads it again
     * for the address. Both go through `response.clone()`, because a Response
     * body can only be consumed once; a refactor to plain `response.json()`
     * would make the second reader throw, and this is the test that would
     * notice.
     */
    mocks.hasAnyUser.mockResolvedValue(true);
    mocks.getSignupMode.mockResolvedValue("invite_only");
    mocks.isOwner.mockResolvedValue(true);
    mocks.findInvitesByPrefix.mockResolvedValue([
      { id: "invite-1", codeHash: "hash:INVITE", invitedBy: "owner-id", email: null },
    ]);
    mocks.claimInvite.mockResolvedValue({ id: "invite-1" });
    mocks.authPOST.mockResolvedValue(created());

    const response = await POST(
      new Request("https://goha.test/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goha-invite": "INVITE" },
        body: JSON.stringify({ email: USER.email, password: "x".repeat(12) }),
      }),
    );

    // Both readers ran: the invitation was tied to the new account...
    expect(mocks.acceptInvite).toHaveBeenCalledWith("invite-1", USER.id);
    // ...and the welcome went to that same account.
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.buildWelcomeEmailEvent).toHaveBeenCalledWith({
      recipientEmail: USER.email,
      displayName: "Nanin",
    });
    // And the handler did not consume the body it hands back to the browser.
    await expect(response.json()).resolves.toMatchObject({ user: { email: USER.email } });
  });

  it("does nothing when the response carries no user", async () => {
    mocks.authPOST.mockResolvedValue(Response.json({ ok: true }, { status: 200 }));

    await POST(authRequest("/api/auth/sign-up/email", { email: USER.email, password: "x".repeat(12) }));

    expect(mocks.claimWelcomeEmail).not.toHaveBeenCalled();
  });
});
