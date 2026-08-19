import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  workerBearerToken,
  workerErrorName,
  workerSecretMatches,
} from "@/lib/automation/worker-auth";

describe("automation worker authentication", () => {
  it("accepts only the configured secret", () => {
    const configured = "worker_" + "a".repeat(48);
    expect(workerSecretMatches(configured, configured)).toBe(true);
    expect(workerSecretMatches("worker_" + "b".repeat(48), configured)).toBe(false);
  });

  it("fails closed when either value is missing", () => {
    expect(workerSecretMatches(null, "configured")).toBe(false);
    expect(workerSecretMatches("presented", undefined)).toBe(false);
    expect(workerSecretMatches(null, undefined)).toBe(false);
  });

  it("fails closed for weak or unreasonably long configured secrets", () => {
    expect(workerSecretMatches("short", "short")).toBe(false);
    const tooLong = "a".repeat(257);
    expect(workerSecretMatches(tooLong, tooLong)).toBe(false);
  });

  it("accepts a bearer header and rejects other schemes", () => {
    expect(workerBearerToken("Bearer worker_secret")).toBe("worker_secret");
    expect(workerBearerToken("bearer   worker_secret ")).toBe("worker_secret");
    expect(workerBearerToken("Basic worker_secret")).toBeNull();
    expect(workerBearerToken(null)).toBeNull();
  });

  it("never copies arbitrary exception names into logs", () => {
    expect(workerErrorName(new TypeError("private detail"))).toBe("TypeError");
    const unsafe = new Error("private detail");
    unsafe.name = "worker_secret_value";
    expect(workerErrorName(unsafe)).toBe("UnknownError");
    expect(workerErrorName("raw failure text")).toBe("UnknownError");
  });
});
