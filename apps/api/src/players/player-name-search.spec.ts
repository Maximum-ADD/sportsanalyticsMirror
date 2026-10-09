import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service.js";
import {
  foldForNameSearch,
  nameMatchesSearchTerms,
  parseNameSearchTerms,
  withNameSearch,
} from "./player-name-search.js";

describe("foldForNameSearch", () => {
  it.each([
    ["Mañón", "manon"],
    ["Jokić", "jokic"],
    ["Dončić", "doncic"],
    ["Nurkić", "nurkic"],
    ["Valančiūnas", "valanciunas"],
    ["Şengün", "sengun"],
    ["Antetokounmpo", "antetokounmpo"],
  ])("strips the accents NFKD splits off: %s -> %s", (name, folded) => {
    expect(foldForNameSearch(name)).toBe(folded);
  });

  // Letters Unicode treats as letters of their own, not a letter plus a
  // mark, so NFKD alone would leave them and "dordevic" would miss.
  it.each([
    ["Đorđević", "dordevic"],
    ["Łukasz", "lukasz"],
    ["Søren", "soren"],
    ["Strauß", "strauss"],
    ["Kılıç", "kilic"],
    ["Ægir", "aegir"],
  ])("maps the letters NFKD leaves whole: %s -> %s", (name, folded) => {
    expect(foldForNameSearch(name)).toBe(folded);
  });

  it("drops apostrophes, the curly one a phone keyboard types included, and full stops", () => {
    expect(foldForNameSearch("De'Aaron")).toBe("deaaron");
    expect(foldForNameSearch("De’Aaron")).toBe("deaaron");
    expect(foldForNameSearch("P.J.")).toBe("pj");
  });

  it("keeps hyphens, so each half of a double-barrelled name still matches on its own", () => {
    expect(foldForNameSearch("Gilgeous-Alexander")).toBe("gilgeous-alexander");
  });
});

describe("parseNameSearchTerms", () => {
  it("splits the search into folded words", () => {
    expect(parseNameSearchTerms("  Bron   MAÑÓN ")).toEqual(["bron", "manon"]);
  });

  it("means no search for a blank, punctuation-only or non-string value", () => {
    expect(parseNameSearchTerms("   ")).toEqual([]);
    expect(parseNameSearchTerms(" . ' ")).toEqual([]);
    expect(parseNameSearchTerms(undefined)).toEqual([]);
    expect(parseNameSearchTerms(["manon"])).toEqual([]);
  });
});

describe("nameMatchesSearchTerms", () => {
  const manon = { firstName: "Juan", lastName: "Mañón" };
  const plainManon = { firstName: "Juan", lastName: "Manon" };

  it('finds "Mañón" from "manon"', () => {
    expect(nameMatchesSearchTerms(manon, parseNameSearchTerms("manon"))).toBe(true);
  });

  it('finds "Manon" from "Mañón" — accents ignored in both directions', () => {
    expect(nameMatchesSearchTerms(plainManon, parseNameSearchTerms("Mañón"))).toBe(true);
  });

  it("matches part of a name, in either the first or the last name", () => {
    expect(nameMatchesSearchTerms(manon, parseNameSearchTerms("ñó"))).toBe(true);
    expect(nameMatchesSearchTerms(manon, parseNameSearchTerms("UAN"))).toBe(true);
  });

  it("needs every word to match, each within one of the two names", () => {
    expect(nameMatchesSearchTerms(manon, parseNameSearchTerms("juan manon"))).toBe(true);
    expect(nameMatchesSearchTerms(manon, parseNameSearchTerms("juan james"))).toBe(false);
    // "anma" would only be found across the gap between the two names.
    expect(nameMatchesSearchTerms(manon, parseNameSearchTerms("anma"))).toBe(false);
  });
});

describe("withNameSearch", () => {
  function makePrisma(candidates: { id: string; firstName: string; lastName: string }[]) {
    const prisma = { player: { findMany: vi.fn().mockResolvedValue(candidates) } };
    return { prisma, prismaService: prisma as unknown as PrismaService };
  }

  it("returns the where clause untouched, with no extra read, when there is nothing to search", async () => {
    const { prisma, prismaService } = makePrisma([]);

    const where = await withNameSearch(prismaService, { teamId: "team-1" }, []);

    expect(where).toEqual({ teamId: "team-1" });
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });

  it("reads the names behind the other filters and narrows to the ids that match", async () => {
    const { prisma, prismaService } = makePrisma([
      { id: "player-manon", firstName: "Juan", lastName: "Mañón" },
      { id: "player-james", firstName: "LeBron", lastName: "James" },
    ]);

    const where = await withNameSearch(prismaService, { position: "G" }, ["manon"]);

    expect(prisma.player.findMany).toHaveBeenCalledWith({
      where: { position: "G" },
      select: { id: true, firstName: true, lastName: true },
    });
    expect(where).toEqual({ position: "G", id: { in: ["player-manon"] } });
  });

  it("narrows to no ids at all when nobody matches, so the list comes back empty", async () => {
    const { prismaService } = makePrisma([{ id: "player-james", firstName: "LeBron", lastName: "James" }]);

    const where = await withNameSearch(prismaService, {}, ["manon"]);

    expect(where).toEqual({ id: { in: [] } });
  });
});
