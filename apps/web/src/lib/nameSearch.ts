// Accent-blind player-name matching for the searches the browser runs
// itself — today the players page's followed-only view, which filters the
// signed-in profile's followed players rather than asking the API.
//
// A copy of the API's apps/api/src/players/player-name-search.ts rules, so
// a name the server search finds is found here too: "manon" finds "Mañón",
// "Mañón" finds "Manon", "deaaron" finds "De'Aaron". Change both together.

// Accents, umlauts, cedillas and the like, once NFKD has split them off the
// letter they sat on ("ñ" becomes "n" + U+0303).
const COMBINING_MARKS = /[̀-ͯ]/g;

// Letters NFKD leaves whole because Unicode counts them as letters in their
// own right ("Đ", "ł", "ø"). Lower case only: the map runs after
// toLowerCase.
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

// Apostrophes (including the curly one phone keyboards type by default) and
// full stops, so "pj" finds "P.J.".
const IGNORED_PUNCTUATION = /['‘’`.]/g;

/** A name or search text with accents, case, apostrophes and full stops folded away. */
export function foldForNameSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(LETTER_WITHOUT_DECOMPOSITION, (letter) => LETTERS_WITHOUT_DECOMPOSITION[letter])
    .replace(IGNORED_PUNCTUATION, "");
}

/**
 * Whether a player's name matches a free-text search: every word of the
 * search must appear in the first name or the last name, ignoring accents
 * and case. A blank search matches everyone.
 */
export function playerNameMatchesSearch(player: { firstName: string; lastName: string }, search: string): boolean {
  const searchTerms = foldForNameSearch(search).split(/\s+/).filter(Boolean);
  const firstName = foldForNameSearch(player.firstName);
  const lastName = foldForNameSearch(player.lastName);
  return searchTerms.every((term) => firstName.includes(term) || lastName.includes(term));
}
