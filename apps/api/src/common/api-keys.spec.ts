import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateApiKeyMaterial } from "./api-keys.js";

describe("generateApiKeyMaterial", () => {
  it("mints a recognisably-prefixed, URL-safe 43-character random part", () => {
    const { rawKey } = generateApiKeyMaterial();
    expect(rawKey).toMatch(/^nba_[A-Za-z0-9_-]{43}$/);
  });

  it("hashes the raw key with SHA-256 so the stored hash verifies it", () => {
    const { rawKey, keyHash } = generateApiKeyMaterial();
    const expected = createHash("sha256").update(rawKey).digest("hex");
    expect(keyHash).toBe(expected);
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never mints the same key twice", () => {
    const a = generateApiKeyMaterial();
    const b = generateApiKeyMaterial();
    expect(a.rawKey).not.toBe(b.rawKey);
    expect(a.keyHash).not.toBe(b.keyHash);
  });
});
