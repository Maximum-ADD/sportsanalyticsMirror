import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service.js";

// Player-name search that ignores accents, so "manon" finds "Mañón" and
// "Mañón" finds "Manon", wherever a name is searched: the public players
// list, its CSV export, the ranked leaderboard and leaders band, and the
// admin players table.
//
// WHY THE MATCHING HAPPENS HERE AND NOT IN SQL
//
// Prisma's `contains` + `mode: "insensitive"` is an ILIKE: it folds case but
// not accents, which is why "manon" never found "Mañón". The ways to fold
// accents inside Postgres all carry a cost this project would pay forever:
//
// - The `unaccent` extension needs CREATE EXTENSION. On Supabase extensions
//   live in the `extensions` schema, but DATABASE_URL pins
//   `?schema=public`, so the function would resolve as `unaccent` in CI's
//   plain Postgres and only as `extensions.unaccent` in production.
//   unaccent() also isn't IMMUTABLE, so indexing it means a wrapper
//   function in `public` — exactly where the
//   20261009120000_lock_down_supabase_data_api migration has just rewritten
//   the default function privileges. A lot of moving parts for a name
//   search.
// - A hand-written `translate(lower(name), 'áàâ…', 'aaa…')` needs no
//   extension, but only folds the letters someone remembered to list, and
//   can only be exercised against a real database (CI), never in a unit
//   test.
// - A stored "folded name" column would need a migration, a way to keep it
//   in step with apps/ingestion/rosters.py (which writes Player rows with
//   its own INSERT), and would ride along in every API payload and export.
//
// The players table is small — it holds the league's rosters, a few hundred
// rows, and historical-season ingestion adds games, not players — so the
// search reads just the id and the two name columns of the players that
// pass the other filters, matches them here with Unicode's own
// decomposition (complete, rather than a list someone keeps by hand), and
// hands the ids to the real query. That costs one light query per search
// request and nothing at all for a list with no search, works identically on
// plain Postgres and Supabase, needs no migration or ingestion change, and
// is covered by the unit specs. The web's followed-players filter folds
// names with a copy of foldForNameSearch (apps/web/src/lib/nameSearch.ts),
// so both searches agree.

// Accents, umlauts, cedillas and the like, once NFKD has split them off the
// letter they sat on ("ñ" becomes "n" + U+0303).
const COMBINING_MARKS = /[̀-ͯ]/g;

// Letters NFKD leaves whole because, to Unicode, they are letters in their
// own right rather than a base letter plus a mark — "Đ" in Croatian and
// Serbian names, "ł" in Polish, "ø" in Danish and Norwegian. Lower case
// only: the map runs after toLowerCase.
const LETTERS_WITHOUT_DECOMPOSITION: Record<string, string> = {
  æ: "ae",
  ð: "d",
  đ: "d",
  ħ: "h",
  ı: "i",
  ł: "l",
  œ: "oe",
  ø: "o",
  ß: "ss",
  þ: "th",
};
const LETTER_WITHOUT_DECOMPOSITION = /[æðđħıłœøßþ]/g;

// Apostrophes (including the curly one phone keyboards insert by default)
// and full stops, so "deaaron" finds "De'Aaron", "De’Aaron" finds it too,
// and "pj" finds "P.J.". Hyphens stay: "Gilgeous-Alexander" is already
// found by either half.
const IGNORED_PUNCTUATION = /['‘’`.]/g;

/**
 * A name or search text reduced to the form names are compared in: no
 * accents, lower case, no apostrophes or full stops.
 *
 * Deliberately separate from admin/derive-player-game-stats.ts's foldName,
 * which mirrors the Python ingestion's credit matcher and has to stay
 * exactly in step with it.
 */
export function foldForNameSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(LETTER_WITHOUT_DECOMPOSITION, (letter) => LETTERS_WITHOUT_DECOMPOSITION[letter])
    .replace(IGNORED_PUNCTUATION, "");
}

/**
 * The folded words of a `search` query value. Every word has to match for a
 * player to be found, so "bron jam" narrows to LeBron James. Anything that
 * isn't a string, or folds away to nothing, means no name search at all.
 */
export function parseNameSearchTerms(search: unknown): string[] {
  if (typeof search !== "string") return [];
  return foldForNameSearch(search).split(/\s+/).filter(Boolean);
}

/**
 * Whether a player's name matches every folded search term, each one found
 * inside the first name or the last name — the same rule the old ILIKE
 * filter applied, now blind to accents.
 */
export function nameMatchesSearchTerms(
  name: { firstName: string; lastName: string },
  searchTerms: string[]
): boolean {
  const firstName = foldForNameSearch(name.firstName);
  const lastName = foldForNameSearch(name.lastName);
  return searchTerms.every((term) => firstName.includes(term) || lastName.includes(term));
}

/**
 * Narrows a player where clause to the players whose names match the
 * search terms (see parseNameSearchTerms).
 *
 * @param prisma - used for the one extra read: the id and name of every
 *   player that passes `where`.
 * @param where - the caller's other filters (team, position and so on).
 * @param searchTerms - folded terms; none means no name filter and no extra
 *   read.
 * @returns `where` unchanged when there is nothing to search for, otherwise
 *   `where` plus an id filter. No player matching gives an empty id list,
 *   which matches nothing, as it should.
 */
export async function withNameSearch(
  prisma: PrismaService,
  where: Prisma.PlayerWhereInput,
  searchTerms: string[]
): Promise<Prisma.PlayerWhereInput> {
  if (searchTerms.length === 0) return where;

  const candidates = await prisma.player.findMany({
    where,
    select: { id: true, firstName: true, lastName: true },
  });
  const matchingIds = candidates
    .filter((candidate) => nameMatchesSearchTerms(candidate, searchTerms))
    .map((candidate) => candidate.id);

  return { ...where, id: { in: matchingIds } };
}
