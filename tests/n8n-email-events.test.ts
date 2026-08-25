import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createEmailEventSender,
  emailEventsConfigured,
  EmailEventConfigurationError,
  emailWebhookSecretMatches,
  readEmailEventConfig,
  type EmailEventConfig,
  type EmailEventDependencies,
} from "@/lib/email-automation/n8n-email-events";

/**
 * The outbound email event layer.
 *
 * Two properties matter more than the payload shape. The sender must NEVER
 * throw, because both call sites are security-sensitive: the reset path has to
 * answer identically whether or not an account exists, and the sign-up path
 * must not fail an account that has already been created. And the webhook
 * secret must never leave the server.
 */

const SECRET = "s".repeat(40);

function config(overrides: Partial<EmailEventConfig> = {}): EmailEventConfig {
  return {
    passwordResetUrl: "https://n8n.example.com/webhook/reset",
    welcomeEmailUrl: "https://n8n.example.com/webhook/welcome",
    secret: SECRET,
    ...overrides,
  };
}

function harness(overrides: Partial<EmailEventDependencies> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;

  const sender = createEmailEventSender({
    fetchImpl,
    getConfig: () => config(),
    newEventId: () => "event-1",
    now: () => new Date("2026-08-22T04:00:00.000Z"),
    logger: { error: vi.fn(), warn: vi.fn() },
    ...overrides,
  });
  return { sender, calls, fetchImpl };
}

describe("readEmailEventConfig", () => {
  it("requires a secret", () => {
    expect(() => readEmailEventConfig({})).toThrow(EmailEventConfigurationError);
  });

  it("rejects a secret short enough to guess", () => {
    expect(() =>
      readEmailEventConfig({ N8N_EMAIL_WEBHOOK_SECRET: "short" }),
    ).toThrow(EmailEventConfigurationError);
  });

  it("refuses a plaintext webhook over the public internet", () => {
    // The secret rides in a header, so http to a remote host would hand it to
    // anyone on the path.
    expect(() =>
      readEmailEventConfig({
        N8N_EMAIL_WEBHOOK_SECRET: SECRET,
        N8N_PASSWORD_RESET_WEBHOOK_URL: "http://n8n.example.com/webhook/reset",
      }),
    ).toThrow(EmailEventConfigurationError);
  });

  it("allows http on localhost, where the workflow is developed", () => {
    const parsed = readEmailEventConfig({
      N8N_EMAIL_WEBHOOK_SECRET: SECRET,
      N8N_PASSWORD_RESET_WEBHOOK_URL: "http://localhost:5678/webhook/reset",
    });
    expect(parsed.passwordResetUrl).toBe("http://localhost:5678/webhook/reset");
  });

  it("treats each webhook as independently optional", () => {
    const parsed = readEmailEventConfig({
      N8N_EMAIL_WEBHOOK_SECRET: SECRET,
      N8N_WELCOME_EMAIL_WEBHOOK_URL: "https://n8n.example.com/webhook/welcome",
    });
    expect(parsed.passwordResetUrl).toBeNull();
    expect(parsed.welcomeEmailUrl).not.toBeNull();
  });

  it("reports unconfigured without throwing at a caller", () => {
    expect(emailEventsConfigured({})).toBe(false);
    expect(
      emailEventsConfigured({
        N8N_EMAIL_WEBHOOK_SECRET: SECRET,
        N8N_WELCOME_EMAIL_WEBHOOK_URL: "https://n8n.example.com/webhook/welcome",
      }),
    ).toBe(true);
  });
});

describe("password reset event", () => {
  it("posts the documented payload to the reset webhook", async () => {
    const { sender, calls } = harness();
    const result = await sender.send(
      sender.buildPasswordResetEvent({
        recipientEmail: "person@example.com",
        displayName: "Maki",
        resetUrl: "https://go-ha.vercel.app/api/auth/reset-password/tok?callbackURL=%2Freset-password",
        expiresInMinutes: 60,
      }),
    );

    expect(result).toEqual({ delivered: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://n8n.example.com/webhook/reset");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      eventType: "password_reset_requested",
      eventId: "event-1",
      recipientEmail: "person@example.com",
      displayName: "Maki",
      resetUrl:
        "https://go-ha.vercel.app/api/auth/reset-password/tok?callbackURL=%2Freset-password",
      expiresInMinutes: 60,
    });
  });

  it("authenticates the call with a bearer secret", async () => {
    const { sender, calls } = harness();
    await sender.send(
      sender.buildPasswordResetEvent({
        recipientEmail: "person@example.com",
        displayName: null,
        resetUrl: "https://go-ha.vercel.app/reset",
        expiresInMinutes: 60,
      }),
    );
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(headers["x-goha-event-id"]).toBe("event-1");
  });

  it("does not follow a redirect, which could replay the token elsewhere", async () => {
    const { sender, calls } = harness();
    await sender.send(
      sender.buildPasswordResetEvent({
        recipientEmail: "person@example.com",
        displayName: null,
        resetUrl: "https://go-ha.vercel.app/reset",
        expiresInMinutes: 60,
      }),
    );
    expect(calls[0].init.redirect).toBe("error");
  });
});

describe("welcome event", () => {
  it("posts to the welcome webhook with the new account's own address", async () => {
    const { sender, calls } = harness();
    const result = await sender.send(
      sender.buildWelcomeEmailEvent({ recipientEmail: "new@example.com", displayName: "Nanin" }),
    );

    expect(result).toEqual({ delivered: true });
    expect(calls[0].url).toBe("https://n8n.example.com/webhook/welcome");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      eventType: "welcome_email",
      eventId: "event-1",
      recipientEmail: "new@example.com",
      displayName: "Nanin",
      createdAt: "2026-08-22T04:00:00.000Z",
    });
  });
});

describe("failure handling", () => {
  it("returns a value instead of throwing when n8n is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED https://n8n.example.com/webhook/reset?token=secret-token");
    }) as unknown as typeof fetch;
    const { sender } = harness({ fetchImpl });

    const result = await sender.send(
      sender.buildPasswordResetEvent({
        recipientEmail: "person@example.com",
        displayName: null,
        resetUrl: "https://go-ha.vercel.app/reset",
        expiresInMinutes: 60,
      }),
    );
    expect(result).toEqual({ delivered: false, reason: "network_error" });
  });

  it("never writes the reset URL or token to the log", async () => {
    // A fetch error message can carry the whole request URL, and for this event
    // that URL contains a single-use credential. Logging it would quietly turn
    // it into a durable one.
    const error = vi.fn();
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect failed for https://go-ha.vercel.app/reset/SUPER-SECRET-TOKEN");
    }) as unknown as typeof fetch;
    const { sender } = harness({ fetchImpl, logger: { error, warn: vi.fn() } });

    await sender.send(
      sender.buildPasswordResetEvent({
        recipientEmail: "person@example.com",
        displayName: null,
        resetUrl: "https://go-ha.vercel.app/reset/SUPER-SECRET-TOKEN",
        expiresInMinutes: 60,
      }),
    );

    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain("SUPER-SECRET-TOKEN");
    expect(logged).toContain("event-1");
  });

  it("reports an http rejection without throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const { sender } = harness({ fetchImpl });
    const result = await sender.send(
      sender.buildWelcomeEmailEvent({ recipientEmail: "new@example.com", displayName: null }),
    );
    expect(result).toEqual({ delivered: false, reason: "http_error" });
  });

  it("skips silently when that event has no webhook configured", async () => {
    const { sender, calls } = harness({
      getConfig: () => config({ passwordResetUrl: null }),
    });
    const result = await sender.send(
      sender.buildPasswordResetEvent({
        recipientEmail: "person@example.com",
        displayName: null,
        resetUrl: "https://go-ha.vercel.app/reset",
        expiresInMinutes: 60,
      }),
    );
    expect(result).toEqual({ delivered: false, reason: "unconfigured" });
    expect(calls).toHaveLength(0);
  });

  it("does not throw when the whole configuration is missing", async () => {
    const { sender } = harness({
      getConfig: () => {
        throw new EmailEventConfigurationError("missing");
      },
    });
    await expect(
      sender.send(sender.buildWelcomeEmailEvent({ recipientEmail: "a@b.com", displayName: null })),
    ).resolves.toEqual({ delivered: false, reason: "unconfigured" });
  });
});

describe("emailWebhookSecretMatches", () => {
  it("accepts the configured secret and rejects everything else", () => {
    expect(emailWebhookSecretMatches(SECRET, SECRET)).toBe(true);
    expect(emailWebhookSecretMatches("x".repeat(40), SECRET)).toBe(false);
    expect(emailWebhookSecretMatches(null, SECRET)).toBe(false);
    expect(emailWebhookSecretMatches(SECRET, undefined)).toBe(false);
  });

  it("refuses to accept a configured secret that is too short to be one", () => {
    expect(emailWebhookSecretMatches("short", "short")).toBe(false);
  });
});

/**
 * The webhook URL and secret must never reach the browser.
 *
 * Read from source rather than asserted through a mock, because the failure
 * this guards against is someone adding `"use client"` to the module or
 * renaming a variable to `NEXT_PUBLIC_*`, and no runtime test in jsdom would
 * notice either.
 */
describe("the webhook credential stays on the server", () => {
  const source = readFileSync(
    join(process.cwd(), "lib", "email-automation", "n8n-email-events.ts"),
    "utf8",
  );

  it("is a server-only module", () => {
    expect(source).toContain('import "server-only"');
    expect(source).not.toContain('"use client"');
  });

  it("never reads a NEXT_PUBLIC_ variable, which Next inlines into the bundle", () => {
    expect(source).not.toContain("NEXT_PUBLIC_");
  });

  it("is imported only from server code", () => {
    const importers = [
      join(process.cwd(), "lib", "auth.ts"),
      join(process.cwd(), "app", "api", "auth", "[...all]", "route.ts"),
    ];
    for (const file of importers) {
      const contents = readFileSync(file, "utf8");
      expect(contents).toContain("n8n-email-events");
      // lib/auth.ts is itself server-only; the route handler is server by
      // definition. Neither may become a client module.
      expect(contents).not.toContain('"use client"');
    }
  });

  it("documents the variables in .env.example without a real value", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    for (const key of [
      "N8N_PASSWORD_RESET_WEBHOOK_URL",
      "N8N_WELCOME_EMAIL_WEBHOOK_URL",
      "N8N_EMAIL_WEBHOOK_SECRET",
    ]) {
      expect(example).toContain(`${key}=`);
      // Placeholder only: the line must carry no value.
      const line = example
        .split("\n")
        .map((entry) => entry.trimEnd())
        .find((entry) => entry.startsWith(`${key}=`));
      expect(line).toBe(`${key}=`);
    }
  });
});
