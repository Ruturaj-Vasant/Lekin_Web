import { describe, expect, it } from "vitest";
import { normalizeSha256, sha256Hex, verifyWheel } from "./wheel-integrity";

describe("pinned wheel integrity", () => {
  it("normalizes the raw checksum contract and rejects malformed values", () => {
    expect(normalizeSha256(`${"A".repeat(64)}\n`)).toBe("a".repeat(64));
    expect(() => normalizeSha256("not-a-checksum")).toThrow(/malformed/i);
  });

  it("computes the expected SHA-256 digest", async () => {
    const bytes = new TextEncoder().encode("lekin").buffer;
    expect(await sha256Hex(bytes)).toBe("5e79828dd176f613982dd72ca0f1bdad3b647468725711e3d41930cc46929918");
  });

  it("fails closed when wheel bytes do not match the checksum", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.endsWith(".sha256")
        ? new Response("0".repeat(64))
        : new Response("tampered wheel");
    };
    await expect(verifyWheel(fetcher as typeof fetch)).rejects.toThrow(/integrity check failed/i);
  });
});
