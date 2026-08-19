import type { Agent } from "node:https";
import type { LookupFunction } from "node:net";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPinnedPushAgent,
  endpointValidationFailureIsTransient,
  isPublicIpAddress,
  pushEndpointHash,
  UnsafePushEndpointError,
  validateAndResolvePushEndpoint,
} from "@/lib/push/endpoint";

describe("Web Push endpoint address policy", () => {
  it.each([
    "1.1.1.1",
    "8.8.8.8",
    "142.250.70.78",
    "2606:4700:4700::1111",
    "2a00:1450:4001:801::200e",
  ])("accepts a globally routable address: %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
  ])("rejects a private or special-use address: %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });
});

describe("validateAndResolvePushEndpoint", () => {
  it("accepts HTTPS only after every DNS answer is public", async () => {
    const resolver = vi.fn(async () => [
      { address: "1.1.1.1", family: 4 as const },
      { address: "2606:4700:4700::1111", family: 6 as const },
    ]);
    const validated = await validateAndResolvePushEndpoint(
      "https://push.example.net/send/abc?x=1",
      resolver,
    );

    expect(resolver).toHaveBeenCalledWith("push.example.net");
    expect(validated.endpoint).toBe("https://push.example.net/send/abc?x=1");
    expect(validated.addresses).toHaveLength(2);
  });

  it.each([
    "http://push.example.net/send",
    "https://user:password@push.example.net/send",
    "https://push.example.net:444/send",
    "https://localhost/send",
    "https://anything.internal/send",
    "https://127.0.0.1/send",
    "https://2130706433/send",
    "https://[::1]/send",
    "not a url",
  ])("rejects an unsafe endpoint before any request: %s", async (endpoint) => {
    const resolver = vi.fn(async () => [{ address: "1.1.1.1", family: 4 as const }]);
    await expect(validateAndResolvePushEndpoint(endpoint, resolver)).rejects.toBeInstanceOf(
      UnsafePushEndpointError,
    );
  });

  it("rejects a mixed public/private DNS result instead of letting Node choose", async () => {
    const resolver = vi.fn(async () => [
      { address: "1.1.1.1", family: 4 as const },
      { address: "10.0.0.8", family: 4 as const },
    ]);
    await expect(
      validateAndResolvePushEndpoint("https://push.example.net/send", resolver),
    ).rejects.toMatchObject({ code: "non_public_address" });
  });

  it("distinguishes a transient DNS failure without exposing resolver details", async () => {
    const resolver = vi.fn(async () => {
      throw new Error("secret resolver diagnostics");
    });
    const error = await validateAndResolvePushEndpoint(
      "https://push.example.net/send",
      resolver,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnsafePushEndpointError);
    expect(error).toMatchObject({ code: "resolution_failed" });
    expect(endpointValidationFailureIsTransient(error)).toBe(true);
    expect(String(error)).not.toContain("secret resolver diagnostics");
  });
});

type AgentWithLookup = Agent & { options: { lookup?: LookupFunction } };

function pinnedLookup(
  agent: Agent,
  hostname: string,
): Promise<Array<{ address: string; family: number }>> {
  const lookup = (agent as AgentWithLookup).options.lookup;
  if (!lookup) throw new Error("Test expected a pinned lookup function.");
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true }, (error, address) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Array.isArray(address) ? address : []);
    });
  });
}

describe("pinned Web Push agent", () => {
  it("returns only the already-approved addresses and refuses another hostname", async () => {
    const agent = createPinnedPushAgent({
      endpoint: "https://push.example.net/send",
      hostname: "push.example.net",
      addresses: [
        { address: "1.1.1.1", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ],
    });

    await expect(pinnedLookup(agent, "push.example.net")).resolves.toEqual([
      { address: "1.1.1.1", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
    await expect(pinnedLookup(agent, "attacker.example.net")).rejects.toMatchObject({
      code: "EACCES",
    });
    agent.destroy();
  });

  it("hashes the endpoint for the ledger without retaining it in the digest", () => {
    const endpoint = "https://push.example.net/high-entropy-capability";
    const hash = pushEndpointHash(endpoint);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(pushEndpointHash(endpoint));
    expect(hash).not.toContain(endpoint);
  });
});
