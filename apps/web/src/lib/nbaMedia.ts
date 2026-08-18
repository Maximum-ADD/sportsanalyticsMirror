// Team logos and player headshots aren't stored anywhere — nba.com serves
// both at predictable, undocumented CDN URLs built directly from the same
// nbaTeamId/nbaPlayerId this app already has on every Team/Player object,
// so there's nothing to ingest or persist. Verified against real ids
// (Lakers, LeBron James) before relying on this pattern.
//
// Not every player has a headshot at this URL — two-way/G-League call-ups
// and very recent draftees often 404. Callers must render these behind an
// <img onError> fallback (see TeamBadge.tsx), never assume the URL resolves.

export function getTeamLogoUrl(nbaTeamId: number): string {
  return `https://cdn.nba.com/logos/nba/${nbaTeamId}/global/L/logo.svg`;
}

export function getPlayerHeadshotUrl(nbaPlayerId: number): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaPlayerId}.png`;
}
