// What every stat abbreviation on the site stands for, in one place.
//
// The trait radar, the Compare glossary and the stat tiles all explain the
// same handful of abbreviations. Each used to carry its own copy of the
// wording, so they drifted (one said "volume chuckers", another "volume
// shooters") and the stat tiles, the most visible of the three, explained
// nothing at all. Keyed by the label exactly as it is printed, so a caller
// looks a term up by the text it already shows. Several labels name the
// same stat (the tiles say PPG where the radar says PTS/G), so those share
// one definition rather than repeating it.

export interface StatDefinition {
  /** The abbreviation spelled out, short enough to sit under a stat tile. */
  name: string;
  /** What it measures and how to read it, for a panel or a glossary list. */
  explain: string;
}

const POINTS: StatDefinition = {
  name: "Points per game",
  explain: "Points per game. The headline scoring output — simply how many points they average a night.",
};

const REBOUNDS: StatDefinition = {
  name: "Rebounds per game",
  explain:
    "Rebounds per game — missed shots they collect. Offensive boards keep a possession alive; defensive ones end the other team's.",
};

const ASSISTS: StatDefinition = {
  name: "Assists per game",
  explain: "Assists per game — baskets they directly set up for teammates. The raw measure of a player's passing output.",
};

const MINUTES: StatDefinition = {
  name: "Minutes per game",
  explain:
    "Minutes per game — how long the coach keeps them on the floor. More court time means more chances at every counting stat.",
};

const STEALS: StatDefinition = {
  name: "Steals per game",
  explain: "Steals per game — how often they take the ball off the opponent. One of the two headline defensive plays.",
};

const BLOCKS: StatDefinition = {
  name: "Blocks per game",
  explain: "Blocks per game — shots they swat away. The rim-protection number that makes drivers think twice.",
};

const TURNOVERS: StatDefinition = {
  name: "Turnovers per game",
  explain:
    "Turnovers per game — possessions handed to the other team. Lower is better, especially for primary ball-handlers.",
};

const GAMES_PLAYED: StatDefinition = {
  name: "Games played",
  explain:
    "Games played — how many games the averages are taken over. The fewer there are, the more one game moves every figure.",
};

const FIELD_GOAL_PERCENTAGE: StatDefinition = {
  name: "Field goal %",
  explain:
    "Field goal percentage — how many of their shots go in, wherever they are taken from. Raw accuracy.",
};

const THREE_POINT_PERCENTAGE: StatDefinition = {
  name: "Three-point %",
  explain:
    "Three-point percentage — accuracy from beyond the arc. A high number forces defences to stretch out and guard them tightly.",
};

const FREE_THROW_PERCENTAGE: StatDefinition = {
  name: "Free throw %",
  explain:
    "Free throw percentage — accuracy at the line, the one shot nobody defends. Late-game fouling targets the shaky ones.",
};

const USAGE: StatDefinition = {
  name: "Usage rate",
  explain:
    "The share of their team's possessions that end in this player shooting, drawing a foul, or turning it over while they're on the floor.",
};

export const STAT_GLOSSARY: Readonly<Record<string, StatDefinition>> = {
  PPG: POINTS,
  "PTS/G": POINTS,
  RPG: REBOUNDS,
  "REB/G": REBOUNDS,
  APG: ASSISTS,
  "AST/G": ASSISTS,
  MPG: MINUTES,
  "MIN/G": MINUTES,
  SPG: STEALS,
  STL: STEALS,
  "STL/G": STEALS,
  BPG: BLOCKS,
  BLK: BLOCKS,
  "BLK/G": BLOCKS,
  TOV: TURNOVERS,
  "TOV/G": TURNOVERS,
  Games: GAMES_PLAYED,
  GP: GAMES_PLAYED,
  "STL+BLK/G": {
    name: "Steals plus blocks per game",
    explain:
      "Steals plus blocks per game — 'stocks'. The all-in-one tally of how much a player disrupts the other team.",
  },
  "FGA/G": {
    name: "Shots attempted per game",
    explain:
      "Field goal attempts per game — how many shots they take. Volume is half of what fills the scoring column.",
  },
  "FTA/G": {
    name: "Free throws attempted per game",
    explain:
      "Free throw attempts per game — how often they get to the line, a sign of how hard they attack the defence.",
  },
  "FG%": FIELD_GOAL_PERCENTAGE,
  "3P%": THREE_POINT_PERCENTAGE,
  "FT%": FREE_THROW_PERCENTAGE,
  "TS%": {
    name: "True shooting %",
    explain:
      "True shooting percentage — scoring efficiency that counts threes and free throws, so volume shooters and efficient scorers aren't lumped together.",
  },
  "eFG%": {
    name: "Effective field goal %",
    explain:
      "Effective field goal percentage — adjusts shooting percentage to weigh a three-pointer as worth more than a two.",
  },
  "USG%": USAGE,
  "Usage %": USAGE,
  "AST:TO": {
    name: "Assist-to-turnover ratio",
    explain:
      "Assist-to-turnover ratio — playmaking weighed against mistakes. Above 2.0 means a player creates twice as often as they cough it up.",
  },
  "+/-": {
    name: "Plus-minus per game",
    explain:
      "Point differential while this player is on the floor — positive means their team outscored the opponent during their minutes.",
  },
  ORTG: {
    name: "Offensive rating",
    explain:
      "Offensive rating — points scored per 100 possessions, pace-adjusted so a fast team and a slow team can be compared fairly. Higher is better.",
  },
  DRTG: {
    name: "Defensive rating",
    explain:
      "Defensive rating — points allowed per 100 possessions, pace-adjusted the same way. Lower is better.",
  },
};

/** The definition for a printed stat label, or undefined for one that needs none (a plain word like "Season"). */
export function describeStat(label: string): StatDefinition | undefined {
  return STAT_GLOSSARY[label];
}

/**
 * The definition for a label the caller knows is in the glossary. Throws
 * rather than returning undefined, so a typo in a hard-coded label fails the
 * first test that renders it instead of silently showing no explanation.
 */
export function requireStat(label: string): StatDefinition {
  const definition = STAT_GLOSSARY[label];
  if (!definition) throw new Error(`No glossary entry for the stat label "${label}"`);
  return definition;
}
