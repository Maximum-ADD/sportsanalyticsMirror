import { describe, expect, it, vi } from "vitest";
import { DataExportService } from "./data-export.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const NOW = new Date("2026-10-09T08:00:00.000Z");

function createService(user: unknown) {
  const findUnique = vi.fn().mockResolvedValue(user);
  const service = new DataExportService({ user: { findUnique } } as unknown as PrismaService);
  return { service, findUnique };
}

describe("DataExportService", () => {
  it("exports only the signed-in user's own record", async () => {
    const { service, findUnique } = createService({ id: "u1", email: "u1@example.com" });

    const exported = await service.exportPersonalData("u1", NOW);

    expect(findUnique.mock.calls[0][0].where).toEqual({ id: "u1" });
    expect(exported).toMatchObject({ exportedAt: NOW.toISOString(), user: { id: "u1", email: "u1@example.com" } });
  });

  it("covers every kind of record the platform keeps about a user", async () => {
    const { service, findUnique } = createService({ id: "u1" });

    await service.exportPersonalData("u1", NOW);

    const select = findUnique.mock.calls[0][0].select;
    for (const relation of [
      "accounts",
      "sessions",
      "followedPlayers",
      "gamePicks",
      "savedComparisons",
      "savedLineups",
      "prospectSeasons",
      "customStatistics",
      "apiConsumer",
      "seenTutorials",
      "favoriteTeam",
    ]) {
      expect(select).toHaveProperty(relation);
    }
  });

  it("never selects a credential: session tokens, OAuth tokens or API key hashes", async () => {
    const { service, findUnique } = createService({ id: "u1" });

    await service.exportPersonalData("u1", NOW);

    const select = findUnique.mock.calls[0][0].select;
    expect(select.sessions.select).not.toHaveProperty("token");
    for (const secret of ["accessToken", "refreshToken", "idToken", "password"]) {
      expect(select.accounts.select).not.toHaveProperty(secret);
    }
    expect(select.apiConsumer.select.keys.select).not.toHaveProperty("keyHash");
  });

  it("returns null for an account that no longer exists", async () => {
    const { service } = createService(null);

    await expect(service.exportPersonalData("gone", NOW)).resolves.toBeNull();
  });
});
