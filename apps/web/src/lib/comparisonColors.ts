// Per-player accent colors shared by everything on the compare page that
// needs to tie a color back to a specific player — the trait radar's
// series/legend and the stat table's head-to-head bars. One shared palette
// so a player's color means the same thing everywhere on the page, up to
// MAX_PLAYERS (4). locker-leather is the app's one accent color, already
// spoken for by the single-player radar and by highlighted "best" cells
// elsewhere on this page, so the rest get distinct, unclaimed hues rather
// than competing with it. Pushed brighter/more saturated than the rest of
// the (deliberately muted, earthy) locker palette — these need to read as
// distinct "player colors" competing for attention, not blend in as another
// neutral surface tone.
export const COMPARISON_PLAYER_COLORS = [
  "var(--color-locker-leather)",
  "#1d6fb8",
  "#2f9e52",
  "#a038c9",
] as const;
