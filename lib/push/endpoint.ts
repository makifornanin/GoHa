import "server-only";

import { createHash } from "node:crypto";
import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { Agent } from "node:https";
import { isIP, type LookupFunction } from "node:net";

export const PUSH_ENDPOINT_MAX_LENGTH = 2048;

export type PushEndpointErrorCode =
  | "invalid_url"
  | "https_required"
  | "credentials_forbidden"
  | "port_forbidden"
  | "hostname_forbidden"
  | "resolution_failed"
  | "no_addresses"
  | "non_public_address";

/** Deliberately carries no endpoint, DNS answer, or provider response. */
export class UnsafePushEndpointError extends Error {
  readonly code: PushEndpointErrorCode;

  constructor(code: PushEndpointErrorCode) {
    super(
      code === "resolution_failed" || code === "no_addresses"
        ? "The push endpoint could not be resolved safely."
        : "The push endpoint was rejected by the outbound request policy.",
    );
    this.name = "UnsafePushEndpointError";
    this.code = code;
  }
}

export type ResolvedPushAddress = { address: string; family: 4 | 6 };
export type PushEndpointResolver = (
  hostname: string,
) => Promise<readonly ResolvedPushAddress[]>;

export type ValidatedPushEndpoint = {
  /** URL-normalized endpoint. The endpoint must still never be logged. */
  endpoint: string;
  hostname: string;
  addresses: readonly ResolvedPushAddress[];
};

const FORBIDDEN_HOST_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "home",
  "lan",
  "test",
  "invalid",
  "example",
  "arpa",
];

function normalizedHostname(value: string): string {
  const unbracketed = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return unbracketed.toLowerCase().replace(/\.$/, "");
}

function hostnameIsForbidden(hostname: string): boolean {
  if (!hostname || hostname.length > 253) return true;
  return FORBIDDEN_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function parseIpv4(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  const parts = address.split(".").map(Number);
  return parts.length === 4 ? parts : null;
}

function isPublicIpv4(address: string): boolean {
  const bytes = parseIpv4(address);
  if (!bytes) return false;
  const [a, b, c] = bytes;

  return !(
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6(address: string): number[] | null {
  if (isIP(address) !== 6) return null;
  let value = address.toLowerCase();

  // Convert an embedded dotted IPv4 tail to the two hextets it represents.
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = parseIpv4(value.slice(lastColon + 1));
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    value = `${value.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || omitted < 0) return null;
  const groups = [...left, ...Array.from({ length: omitted }, () => "0"), ...right];
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    const parsed = Number.parseInt(group, 16);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) return null;
    bytes.push(parsed >>> 8, parsed & 0xff);
  }
  return bytes;
}

function hasPrefix(address: number[], prefix: number[], bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  for (let i = 0; i < fullBytes; i++) {
    if (address[i] !== prefix[i]) return false;
  }
  const remaining = bits % 8;
  if (remaining === 0) return true;
  const mask = (0xff << (8 - remaining)) & 0xff;
  return (address[fullBytes] & mask) === (prefix[fullBytes] & mask);
}

function isPublicIpv6(address: string): boolean {
  const bytes = parseIpv6(address);
  if (!bytes) return false;

  // Public Web Push services have globally routable unicast addresses. Limit
  // outbound connections to 2000::/3, then remove special-use ranges inside it.
  if ((bytes[0] & 0xe0) !== 0x20) return false;
  if (hasPrefix(bytes, [0x20, 0x01, 0x00, 0x00], 32)) return false; // Teredo
  if (hasPrefix(bytes, [0x20, 0x01, 0x00, 0x02, 0x00, 0x00], 48)) return false; // benchmark
  if (hasPrefix(bytes, [0x20, 0x01, 0x00, 0x10], 28)) return false; // ORCHID
  if (hasPrefix(bytes, [0x20, 0x01, 0x00, 0x20], 28)) return false; // ORCHIDv2
  if (hasPrefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)) return false; // documentation
  if (hasPrefix(bytes, [0x20, 0x02], 16)) return false; // 6to4 tunnel
  if (hasPrefix(bytes, [0x3f, 0xff, 0x00], 20)) return false; // documentation
  return true;
}

/** True only for public, globally routable IPv4/IPv6 addresses. */
export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

const systemResolver: PushEndpointResolver = async (hostname) => {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.flatMap((entry: LookupAddress) => {
    const family = isIP(entry.address);
    return family === 4 || family === 6
      ? [{ address: entry.address, family } satisfies ResolvedPushAddress]
      : [];
  });
};

/**
 * Parse, resolve, and approve an endpoint before it can be stored or contacted.
 * Every DNS answer must be public: accepting the public answer from a mixed set
 * would still let an attacker influence which address Node ultimately chooses.
 */
export async function validateAndResolvePushEndpoint(
  rawEndpoint: string,
  resolver: PushEndpointResolver = systemResolver,
): Promise<ValidatedPushEndpoint> {
  if (
    typeof rawEndpoint !== "string" ||
    rawEndpoint.length < 9 ||
    rawEndpoint.length > PUSH_ENDPOINT_MAX_LENGTH
  ) {
    throw new UnsafePushEndpointError("invalid_url");
  }

  let url: URL;
  try {
    url = new URL(rawEndpoint);
  } catch {
    throw new UnsafePushEndpointError("invalid_url");
  }

  if (url.protocol !== "https:") throw new UnsafePushEndpointError("https_required");
  if (url.username || url.password) throw new UnsafePushEndpointError("credentials_forbidden");
  if (url.port && url.port !== "443") throw new UnsafePushEndpointError("port_forbidden");

  const hostname = normalizedHostname(url.hostname);
  if (hostnameIsForbidden(hostname)) {
    throw new UnsafePushEndpointError("hostname_forbidden");
  }

  const literalFamily = isIP(hostname);
  let resolved: readonly ResolvedPushAddress[];
  if (literalFamily === 4 || literalFamily === 6) {
    resolved = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      resolved = await resolver(hostname);
    } catch {
      throw new UnsafePushEndpointError("resolution_failed");
    }
  }

  if (resolved.length === 0) throw new UnsafePushEndpointError("no_addresses");

  const addresses: ResolvedPushAddress[] = [];
  const seen = new Set<string>();
  for (const item of resolved) {
    const family = isIP(item.address);
    if ((family !== 4 && family !== 6) || !isPublicIpAddress(item.address)) {
      throw new UnsafePushEndpointError("non_public_address");
    }
    const key = `${family}:${item.address.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      addresses.push({ address: item.address, family });
    }
  }

  return { endpoint: url.href, hostname, addresses };
}

export function endpointValidationFailureIsTransient(error: unknown): boolean {
  return (
    error instanceof UnsafePushEndpointError &&
    (error.code === "resolution_failed" || error.code === "no_addresses")
  );
}

/** A non-reversible key for the delivery ledger; the endpoint itself stays private. */
export function pushEndpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint, "utf8").digest("hex");
}

/**
 * An HTTPS agent whose lookup can return only the addresses approved above.
 * This closes the DNS-rebinding gap between validation and web-push's request.
 */
export function createPinnedPushAgent(validated: ValidatedPushEndpoint): Agent {
  const expectedHostname = normalizedHostname(validated.hostname);
  const pinned = [...validated.addresses];
  let cursor = 0;

  const lookup: LookupFunction = (requestedHostname, options, callback) => {
    if (normalizedHostname(requestedHostname) !== expectedHostname) {
      const error = Object.assign(new Error("Pinned push agent rejected a different hostname."), {
        code: "EACCES",
      });
      callback(error, options.all ? [] : "", 0);
      return;
    }

    const requestedFamily =
      options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
    const candidates =
      requestedFamily === 4 || requestedFamily === 6
        ? pinned.filter((item) => item.family === requestedFamily)
        : pinned;

    if (candidates.length === 0) {
      const error = Object.assign(new Error("No approved address for the requested family."), {
        code: "EAI_ADDRFAMILY",
      });
      callback(error, options.all ? [] : "", 0);
      return;
    }

    if (options.all) {
      callback(
        null,
        candidates.map(({ address, family }) => ({ address, family })),
      );
      return;
    }

    const candidate = candidates[cursor % candidates.length];
    cursor += 1;
    callback(null, candidate.address, candidate.family);
  };

  return new Agent({ keepAlive: false, maxSockets: 1, maxFreeSockets: 0, lookup });
}
