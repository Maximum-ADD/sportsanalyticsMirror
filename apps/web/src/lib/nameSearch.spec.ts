import { describe, expect, it } from "vitest";
import { foldForNameSearch, playerNameMatchesSearch } from "./nameSearch";

const MANON = { firstName: "Juan", lastName: "Mañón" };
const PLAIN_MANON = { firstName: "Juan", lastName: "Manon" };

describe("foldForNameSearch", () => {
  it("folds accents, case and the letters NFKD leaves whole", () => {
    expect(foldForNameSearch("Mañón")).toBe("manon");
    expect(foldForNameSearch("Jokić")).toBe("jokic");
    expect(foldForNameSearch("Đorđević")).toBe("dordevic");
    expect(foldForNameSearch("Łukasz Søren")).toBe("lukasz soren");
  });

  it("drops apostrophes, straight or curly, and full stops", () => {
    expect(foldForNameSearch("De’Aaron P.J.")).toBe("deaaron pj");
  });
});

describe("playerNameMatchesSearch", () => {
  it('finds "Mañón" from "manon"', () => {
    expect(playerNameMatchesSearch(MANON, "manon")).toBe(true);
  });

  it('finds "Manon" from "Mañón"', () => {
    expect(playerNameMatchesSearch(PLAIN_MANON, "Mañón")).toBe(true);
  });

  it("needs every word to match the first or the last name", () => {
    expect(playerNameMatchesSearch(MANON, "JUAN man")).toBe(true);
    expect(playerNameMatchesSearch(MANON, "juan james")).toBe(false);
  });

  it("matches everyone on a blank search", () => {
    expect(playerNameMatchesSearch(MANON, "   ")).toBe(true);
  });
});
