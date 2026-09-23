import { createHash, randomBytes } from "node:crypto";

// The raw key is only ever returned once — at creation time. The service
// stores a SHA-256 hash, and the client must save the raw key securely
// before the response is gone.
export interface CreatedApiKey {
  id: string;
  label: string | null;
  rawKey: string;
  createdAt: Date;
}

// Generates the raw/hashed pair for one API key. 32 random bytes,
// base64url-encoded — 43 characters, URL-safe, no padding issues. Prefixed
// so a key is recognisable in logs. Only the hash is ever persisted, so a
// database leak doesn't expose usable keys.
//
// Shared by the admin consumer flow (AdminConsumersService) and the
// user-facing flow (MeApiKeysService) so both sides mint keys in exactly
// the same format — the ApiKeyGuard only ever sees the hash, so the two
// key populations are indistinguishable at request time, which is what
// lets user keys and external consumer keys share one table, one guard and
// one rate-limit machinery.
export function generateApiKeyMaterial(): { rawKey: string; keyHash: string } {
  const rawKey = `nba_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  return { rawKey, keyHash };
}
