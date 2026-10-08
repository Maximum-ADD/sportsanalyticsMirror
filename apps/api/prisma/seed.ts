import { createHash, randomBytes } from "node:crypto";
import { PrismaClient, type SeasonType } from "@prisma/client";

const prisma = new PrismaClient();

const SEASON = "2025-26";
const SEASON_START_MONTH_INDEX = 9; // October (JS Date months are 0-indexed)
const SEASON_START_DAY = 15;
const DAYS_BETWEEN_GAMES = 3;

const MOCK_TEAMS = [
  { nbaTeamId: 1610612747, name: "Lakers", abbreviation: "LAL", city: "Los Angeles", conference: "West", division: "Pacific" },
  { nbaTeamId: 1610612738, name: "Celtics", abbreviation: "BOS", city: "Boston", conference: "East", division: "Atlantic" },
  { nbaTeamId: 1610612744, name: "Warriors", abbreviation: "GSW", city: "Golden State", conference: "West", division: "Pacific" },
  { nbaTeamId: 1610612749, name: "Bucks", abbreviation: "MIL", city: "Milwaukee", conference: "East", division: "Central" },
];

// Three players per team so the roster view has some depth. Not a full
// league — that's what the real nba_api ingestion pipeline (see README) is
// for — but every seeded team plays a full mock schedule below, so no team
// is a second-class citizen in the demo data the way LAL/BOS used to be.
const MOCK_PLAYERS = [
  { nbaPlayerId: 2544, firstName: "LeBron", lastName: "James", position: "F", heightInches: 81, weightLbs: 250, jerseyNumber: "23", teamAbbreviation: "LAL" },
  { nbaPlayerId: 203076, firstName: "Anthony", lastName: "Davis", position: "F-C", heightInches: 82, weightLbs: 253, jerseyNumber: "3", teamAbbreviation: "LAL" },
  { nbaPlayerId: 1630559, firstName: "Austin", lastName: "Reaves", position: "G", heightInches: 77, weightLbs: 197, jerseyNumber: "15", teamAbbreviation: "LAL" },

  { nbaPlayerId: 1628369, firstName: "Jayson", lastName: "Tatum", position: "F", heightInches: 80, weightLbs: 210, jerseyNumber: "0", teamAbbreviation: "BOS" },
  { nbaPlayerId: 1627759, firstName: "Jaylen", lastName: "Brown", position: "G-F", heightInches: 78, weightLbs: 223, jerseyNumber: "7", teamAbbreviation: "BOS" },
  { nbaPlayerId: 1628401, firstName: "Derrick", lastName: "White", position: "G", heightInches: 76, weightLbs: 190, jerseyNumber: "9", teamAbbreviation: "BOS" },

  { nbaPlayerId: 201939, firstName: "Stephen", lastName: "Curry", position: "G", heightInches: 74, weightLbs: 185, jerseyNumber: "30", teamAbbreviation: "GSW" },
  { nbaPlayerId: 203110, firstName: "Draymond", lastName: "Green", position: "F", heightInches: 79, weightLbs: 230, jerseyNumber: "23", teamAbbreviation: "GSW" },
  { nbaPlayerId: 1627741, firstName: "Buddy", lastName: "Hield", position: "G", heightInches: 76, weightLbs: 214, jerseyNumber: "7", teamAbbreviation: "GSW" },

  { nbaPlayerId: 203507, firstName: "Giannis", lastName: "Antetokounmpo", position: "F", heightInches: 83, weightLbs: 243, jerseyNumber: "34", teamAbbreviation: "MIL" },
  { nbaPlayerId: 203081, firstName: "Damian", lastName: "Lillard", position: "G", heightInches: 74, weightLbs: 195, jerseyNumber: "0", teamAbbreviation: "MIL" },
  { nbaPlayerId: 203114, firstName: "Khris", lastName: "Middleton", position: "F", heightInches: 80, weightLbs: 222, jerseyNumber: "22", teamAbbreviation: "MIL" },
];

function generateBoxScore() {
  const fieldGoalsAttempted = 14 + Math.floor(Math.random() * 8);
  const fieldGoalsMade = Math.floor(fieldGoalsAttempted * (0.42 + Math.random() * 0.15));
  const threesAttempted = 3 + Math.floor(Math.random() * 6);
  const threesMade = Math.floor(threesAttempted * (0.3 + Math.random() * 0.25));
  const freeThrowsAttempted = 2 + Math.floor(Math.random() * 6);
  const freeThrowsMade = Math.floor(freeThrowsAttempted * (0.7 + Math.random() * 0.25));

  const twoPointersMade = fieldGoalsMade - threesMade;
  const points = twoPointersMade * 2 + threesMade * 3 + freeThrowsMade;

  // Split so offensive + defensive always equals the total — a seeded row
  // that contradicted itself would make any rebound-rate work built on this
  // data quietly wrong.
  const rebounds = 3 + Math.floor(Math.random() * 9);
  const offensiveRebounds = Math.floor(rebounds * (0.15 + Math.random() * 0.25));

  return {
    minutes: 30 + Math.floor(Math.random() * 10),
    points,
    rebounds,
    assists: 2 + Math.floor(Math.random() * 8),
    steals: Math.floor(Math.random() * 3),
    blocks: Math.floor(Math.random() * 3),
    turnovers: 1 + Math.floor(Math.random() * 4),
    fieldGoalsMade,
    fieldGoalsAttempted,
    threesMade,
    threesAttempted,
    freeThrowsMade,
    freeThrowsAttempted,
    offensiveRebounds,
    defensiveRebounds: rebounds - offensiveRebounds,

    // Generated rather than left null so local dev and the e2e suite
    // actually exercise the advanced tiles and the compare page's "Other"
    // section. Ranges are plausible NBA values (usage 10-35%, ratings
    // 95-125, plus/minus roughly -15 to +15), not derived from the
    // boxscore above — this is demo data, and the real figures come from
    // BoxScoreAdvancedV3 during ingestion.
    plusMinus: Math.floor(Math.random() * 31) - 15,
    usagePercentage: Math.round((10 + Math.random() * 25) * 10) / 10,
    offensiveRating: Math.round((95 + Math.random() * 30) * 10) / 10,
    defensiveRating: Math.round((95 + Math.random() * 30) * 10) / 10,
  };
}

async function seedTeams() {
  const teams = new Map<string, string>();
  for (const team of MOCK_TEAMS) {
    const created = await prisma.team.upsert({
      where: { nbaTeamId: team.nbaTeamId },
      update: {},
      create: team,
    });
    teams.set(team.abbreviation, created.id);
  }
  return teams;
}

async function seedPlayers(teamIdsByAbbreviation: Map<string, string>) {
  const playersByTeamAbbreviation = new Map<string, Awaited<ReturnType<typeof prisma.player.upsert>>[]>();
  for (const player of MOCK_PLAYERS) {
    const { teamAbbreviation, ...playerData } = player;
    const created = await prisma.player.upsert({
      where: { nbaPlayerId: player.nbaPlayerId },
      update: {},
      create: { ...playerData, teamId: teamIdsByAbbreviation.get(teamAbbreviation) },
    });
    const teamRoster = playersByTeamAbbreviation.get(teamAbbreviation) ?? [];
    teamRoster.push(created);
    playersByTeamAbbreviation.set(teamAbbreviation, teamRoster);
  }
  return playersByTeamAbbreviation;
}

function roundRobinPairs<T>(items: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

type SeededPlayersByTeam = Map<string, Awaited<ReturnType<typeof prisma.player.upsert>>[]>;

// Creates one game plus its period bookend events and a boxscore row for
// every player on both rosters. Shared by the regular-season and postseason
// seeding below, which differ only in their fixture list and the season
// segment they tag games with.
async function createGameWithStats(
  nbaGameId: string,
  gameDate: Date,
  homeAbbreviation: string,
  awayAbbreviation: string,
  seasonType: SeasonType,
  playoffRound: number | null,
  playersByTeamAbbreviation: SeededPlayersByTeam,
  teamIdsByAbbreviation: Map<string, string>
) {
  const game = await prisma.game.upsert({
    where: { nbaGameId },
    update: {},
    create: {
      nbaGameId,
      gameDate,
      season: SEASON,
      seasonType,
      playoffRound,
      homeTeamId: teamIdsByAbbreviation.get(homeAbbreviation)!,
      awayTeamId: teamIdsByAbbreviation.get(awayAbbreviation)!,
      homeScore: 100 + Math.floor(Math.random() * 20),
      awayScore: 100 + Math.floor(Math.random() * 20),
    },
  });

  await prisma.gameEvent.createMany({
    data: [
      { gameId: game.id, sequence: 1, period: 1, clock: "12:00", eventType: "PERIOD_START", description: "Period 1 start" },
      { gameId: game.id, sequence: 2, period: 4, clock: "0:00", eventType: "PERIOD_END", description: "Game end" },
    ],
    skipDuplicates: true,
  });

  const gameRoster = [
    ...(playersByTeamAbbreviation.get(homeAbbreviation) ?? []),
    ...(playersByTeamAbbreviation.get(awayAbbreviation) ?? []),
  ];
  for (const player of gameRoster) {
    await prisma.playerGameStat.upsert({
      where: { playerId_gameId: { playerId: player.id, gameId: game.id } },
      update: {},
      create: { playerId: player.id, gameId: game.id, ...generateBoxScore() },
    });
  }
}

// Every pair of seeded teams plays each other twice (home and away), so
// every team — not just one — ends up with a full slate of games and every
// player on every roster has real per-game boxscores to derive stats from.
async function seedGamesAndStats(
  playersByTeamAbbreviation: SeededPlayersByTeam,
  teamIdsByAbbreviation: Map<string, string>
) {
  const teamAbbreviations = [...teamIdsByAbbreviation.keys()];
  const fixtures = [
    ...roundRobinPairs(teamAbbreviations),
    ...roundRobinPairs(teamAbbreviations).map(([home, away]): [string, string] => [away, home]),
  ];

  for (const [gameIndex, [homeAbbreviation, awayAbbreviation]] of fixtures.entries()) {
    const gameDate = new Date(2025, SEASON_START_MONTH_INDEX, SEASON_START_DAY + gameIndex * DAYS_BETWEEN_GAMES);
    await createGameWithStats(
      `MOCK-GAME-${gameIndex}`,
      gameDate,
      homeAbbreviation,
      awayAbbreviation,
      "REGULAR",
      null,
      playersByTeamAbbreviation,
      teamIdsByAbbreviation
    );
  }
}

// A miniature postseason among the four seeded teams, so local dev and the
// e2e suite exercise the segment views without needing a real ingestion run.
//
// Deliberately not a bracket every team survives: GSW and MIL appear in the
// play-in and first round but never the Finals, which is what makes the
// "this player didn't appear in this segment" empty state and the
// `participated=true` player filter testable at all. A postseason where
// everyone plays everywhere would let both of those ship broken.
const POSTSEASON_SERIES: { seasonType: SeasonType; playoffRound: number | null; home: string; away: string; games: number }[] = [
  { seasonType: "PLAY_IN", playoffRound: null, home: "GSW", away: "MIL", games: 2 },
  { seasonType: "PLAYOFFS", playoffRound: 1, home: "LAL", away: "GSW", games: 5 },
  { seasonType: "PLAYOFFS", playoffRound: 1, home: "BOS", away: "MIL", games: 5 },
  { seasonType: "FINALS", playoffRound: 4, home: "LAL", away: "BOS", games: 4 },
];

const POSTSEASON_START_MONTH_INDEX = 3; // April
const POSTSEASON_START_DAY = 12;
const DAYS_BETWEEN_POSTSEASON_GAMES = 2;

async function seedPostseasonGamesAndStats(
  playersByTeamAbbreviation: SeededPlayersByTeam,
  teamIdsByAbbreviation: Map<string, string>
) {
  let gameIndex = 0;
  for (const series of POSTSEASON_SERIES) {
    for (let gameInSeries = 0; gameInSeries < series.games; gameInSeries++) {
      const gameDate = new Date(
        2026,
        POSTSEASON_START_MONTH_INDEX,
        POSTSEASON_START_DAY + gameIndex * DAYS_BETWEEN_POSTSEASON_GAMES
      );
      await createGameWithStats(
        `MOCK-POSTSEASON-GAME-${gameIndex}`,
        gameDate,
        series.home,
        series.away,
        series.seasonType,
        series.playoffRound,
        playersByTeamAbbreviation,
        teamIdsByAbbreviation
      );
      gameIndex++;
    }
  }
}

// Game/GameEvent/PlayerGameStat are cleared and fully regenerated on every
// run, rather than upserted like teams/players, because which fixture a
// given nbaGameId maps to is a function of this script's fixture-generation
// logic — upserting would leave stale rows from a previous run's schedule
// mismatched against the current one.
// Archetypes and similar players for the mock roster, so the profile card,
// the archetype endpoint and the cluster map all render locally without a
// full season ingested. apps/similarity/build_archetypes.py produces these
// for real; it refuses to run on a database this small, and rightly so —
// nine archetypes over twelve players is not a model. These are hand-set
// to be plausible instead.
//
// UNLIKE generateBoxScore ABOVE, EVERYTHING HERE IS DETERMINISTIC. The
// box scores are random because nothing asserts on them; archetypes are
// asserted on by the API tests and the web tests, which cannot pin a value
// that changes every re-seed.
const MOCK_ARCHETYPE_LABELS = [
  "Point forward",
  "Scoring guard",
  "Scoring wing",
  "Catch-and-shoot wing",
  "Traditional big",
];

// Strongest archetype first. Weights are the blend apps/similarity computes
// from distance to each centroid — they are an ordering with a sense of
// proportion, not probabilities, so they do not need to sum to 1 across the
// two or three shown here.
//
// Two of the twelve players are deliberately absent: a player can exist,
// have game stats, and still have no archetype because they fall under the
// minutes floor. That is a real state with its own empty state on the
// profile card and its own branch in the endpoint's two-step 404, and it
// cannot be tested if every seeded player has an archetype.
const MOCK_ARCHETYPE_ASSIGNMENTS: {
  nbaPlayerId: number;
  memberships: { label: string; weight: number }[];
  plotX: number;
  plotY: number;
  distanceToCentroid: number;
}[] = [
  // LeBron James — the archetype's textbook example, hence the small distance.
  { nbaPlayerId: 2544, plotX: -1.62, plotY: 1.44, distanceToCentroid: 0.71,
    memberships: [{ label: "Point forward", weight: 0.68 }, { label: "Scoring wing", weight: 0.19 }, { label: "Scoring guard", weight: 0.11 }] },
  // Giannis Antetokounmpo — a point forward with real big-man pull.
  { nbaPlayerId: 203507, plotX: -1.98, plotY: 1.02, distanceToCentroid: 1.35,
    memberships: [{ label: "Point forward", weight: 0.54 }, { label: "Traditional big", weight: 0.31 }, { label: "Scoring wing", weight: 0.12 }] },
  // Draymond Green — a tweener, and the clearest case for showing more than
  // one archetype: no single label describes him.
  { nbaPlayerId: 203110, plotX: -1.21, plotY: 0.62, distanceToCentroid: 2.04,
    memberships: [{ label: "Point forward", weight: 0.41 }, { label: "Traditional big", weight: 0.34 }, { label: "Catch-and-shoot wing", weight: 0.18 }] },

  { nbaPlayerId: 201939, plotX: 1.88, plotY: 1.21, distanceToCentroid: 0.94,
    memberships: [{ label: "Scoring guard", weight: 0.74 }, { label: "Catch-and-shoot wing", weight: 0.17 }] },
  { nbaPlayerId: 203081, plotX: 1.71, plotY: 1.09, distanceToCentroid: 1.12,
    memberships: [{ label: "Scoring guard", weight: 0.69 }, { label: "Catch-and-shoot wing", weight: 0.21 }] },
  // Austin Reaves — a secondary creator, so a genuinely split profile.
  { nbaPlayerId: 1630559, plotX: 1.24, plotY: 0.38, distanceToCentroid: 1.77,
    memberships: [{ label: "Scoring guard", weight: 0.48 }, { label: "Scoring wing", weight: 0.29 }, { label: "Catch-and-shoot wing", weight: 0.14 }] },

  { nbaPlayerId: 1628369, plotX: 0.42, plotY: 1.31, distanceToCentroid: 0.83,
    memberships: [{ label: "Scoring wing", weight: 0.71 }, { label: "Point forward", weight: 0.18 }] },
  { nbaPlayerId: 1627759, plotX: 0.61, plotY: 0.88, distanceToCentroid: 1.19,
    memberships: [{ label: "Scoring wing", weight: 0.63 }, { label: "Scoring guard", weight: 0.22 }] },

  // Buddy Hield — a specialist, so one overwhelming archetype. The card has
  // to read well for this case too, not only for tweeners.
  { nbaPlayerId: 1627741, plotX: 1.02, plotY: -1.14, distanceToCentroid: 0.66,
    memberships: [{ label: "Catch-and-shoot wing", weight: 0.88 }] },

  { nbaPlayerId: 203076, plotX: -1.84, plotY: -1.32, distanceToCentroid: 1.05,
    memberships: [{ label: "Traditional big", weight: 0.72 }, { label: "Point forward", weight: 0.15 }] },

  // Derrick White and Khris Middleton are intentionally omitted — see above.
];

/**
 * Builds a plausible 15-value standardized feature vector for a mock player.
 *
 * The real vectors are z-scores in apps/similarity/features.FEATURE_NAMES
 * order, which the profile radar plots against a league average of zero.
 * These are illustrative rather than derived from the seeded box scores:
 * twelve players cannot produce a meaningful league average to be scored
 * against, so computing them here would give false precision to a number
 * nothing real stands behind.
 *
 * Deterministic from the player's position in the assignment list, so a
 * re-seed produces the same radar and a test can pin it.
 */
function buildMockFeatureVector(assignmentIndex: number): number[] {
  const FEATURE_COUNT = 15;
  return Array.from({ length: FEATURE_COUNT }, (_, featureIndex) => {
    const wave = Math.sin((assignmentIndex + 1) * (featureIndex + 1));
    return Math.round(wave * 150) / 100;
  });
}

/**
 * Seeds archetypes, per-player memberships and similar-player lists.
 *
 * Similar players are drawn only from players that have an archetype,
 * mirroring the real pipeline: both come from the same eligible set, so a
 * player without enough minutes is neither placed nor suggested.
 */
async function seedArchetypes(playersByNbaId: Map<number, { id: string }>) {
  const archetypeIdsByLabel = new Map<string, string>();

  for (const [clusterId, label] of MOCK_ARCHETYPE_LABELS.entries()) {
    // Derived rather than hand-written so it cannot drift from the
    // assignments above — the same reason the real writer recomputes it.
    const memberCount = MOCK_ARCHETYPE_ASSIGNMENTS.filter(
      (assignment) => assignment.memberships[0].label === label,
    ).length;
    const archetype = await prisma.archetype.create({
      data: {
        season: SEASON,
        label,
        clusterId,
        referenceCentroid: buildMockFeatureVector(clusterId),
        memberCount,
        modelVersion: "seed",
      },
    });
    archetypeIdsByLabel.set(label, archetype.id);
  }

  for (const [assignmentIndex, assignment] of MOCK_ARCHETYPE_ASSIGNMENTS.entries()) {
    const player = playersByNbaId.get(assignment.nbaPlayerId);
    if (!player) continue;

    await prisma.playerArchetype.create({
      data: {
        playerId: player.id,
        season: SEASON,
        featureVector: buildMockFeatureVector(assignmentIndex),
        distanceToCentroid: assignment.distanceToCentroid,
        plotX: assignment.plotX,
        plotY: assignment.plotY,
        modelVersion: "seed",
        memberships: {
          create: assignment.memberships.map((membership, membershipIndex) => ({
            archetypeId: archetypeIdsByLabel.get(membership.label)!,
            rank: membershipIndex + 1,
            weight: membership.weight,
          })),
        },
      },
    });
  }

  await seedSimilarPlayers(playersByNbaId);
}

const SIMILAR_PLAYERS_PER_PLAYER = 5;

/**
 * Seeds each archetyped player's nearest neighbours, ranked by distance on
 * the mock cluster map.
 *
 * Computed from plotX/plotY rather than hand-listed so the seeded lists
 * agree with where the seeded players sit on the map. A demo where a
 * player's "most similar" sits on the far side of the plot invites exactly
 * the question the feature is supposed to answer.
 */
async function seedSimilarPlayers(playersByNbaId: Map<number, { id: string }>) {
  const placed = MOCK_ARCHETYPE_ASSIGNMENTS.filter((assignment) =>
    playersByNbaId.has(assignment.nbaPlayerId),
  );

  for (const subject of placed) {
    const neighbours = placed
      .filter((candidate) => candidate.nbaPlayerId !== subject.nbaPlayerId)
      .map((candidate) => ({
        candidate,
        distance: Math.hypot(candidate.plotX - subject.plotX, candidate.plotY - subject.plotY),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, SIMILAR_PLAYERS_PER_PLAYER);

    const widestDistance = neighbours[neighbours.length - 1]?.distance || 1;
    for (const [neighbourIndex, neighbour] of neighbours.entries()) {
      await prisma.playerSimilarity.create({
        data: {
          playerId: playersByNbaId.get(subject.nbaPlayerId)!.id,
          similarPlayerId: playersByNbaId.get(neighbour.candidate.nbaPlayerId)!.id,
          season: SEASON,
          rank: neighbourIndex + 1,
          // Falls away with distance, like the real score, and stays inside
          // 0-100 without ever reaching either end.
          similarityScore: Math.round((95 - (neighbour.distance / widestDistance) * 35) * 10) / 10,
          modelVersion: "seed",
        },
      });
    }
  }
}

async function resetArchetypeData() {
  // Memberships cascade from both PlayerArchetype and Archetype, so they
  // are not deleted explicitly. Archetype goes last because memberships
  // still reference it while they exist.
  await prisma.playerSimilarity.deleteMany();
  await prisma.playerArchetype.deleteMany();
  await prisma.archetype.deleteMany();
}

async function resetGameData() {
  // Every table with a foreign key to Game has to go first, in dependency
  // order, or the game delete fails on a constraint. Deleting only stats
  // and events was enough while nothing else wrote game-scoped rows, but
  // an ingestion pull (IngestionBatch), the predictor (GamePrediction,
  // GamePredictionRun), the odds fetch (GameMarketOdds) and an admin
  // correction (EventCorrection) all leave rows that block a re-seed.
  //
  // GameEvent is deleted before IngestionBatch because it points at both;
  // its batch link is SetNull, so the order only matters for clarity.
  await prisma.eventCorrection.deleteMany();
  await prisma.gameEvent.deleteMany();
  await prisma.playerGameStat.deleteMany();
  await prisma.ingestionBatch.deleteMany();
  await prisma.gamePrediction.deleteMany();
  await prisma.gamePredictionRun.deleteMany();
  await prisma.gameMarketOdds.deleteMany();
  // Cascades on Game delete, but listed so this reads as the full set.
  await prisma.gamePick.deleteMany();
  await prisma.game.deleteMany();
}

// The consumer the local web app's dev proxy authenticates as. The public
// read endpoints need an API key or a session, and the proxy attaches
// SITE_PROXY_API_KEY to signed-out requests (see apps/web/vite.config.ts);
// without a matching key in the local database, every signed-out page
// would get a 401.
const LOCAL_SITE_CONSUMER_ID = "local-site-proxy";
const LOCAL_SITE_RATE_LIMIT_PER_MINUTE = 1_000;
const LOCAL_SITE_DAILY_QUOTA = 1_000_000;

/**
 * Creates the local site-proxy consumer and a fresh key for it, and prints
 * the line to put in apps/web/.env.
 *
 * The key is random on every run rather than a committed constant, so a
 * seed run against the wrong database can't leave behind a key anyone could
 * read from the repo. Earlier site-proxy keys are revoked, so only the one
 * just printed works. The format matches generateApiKeyMaterial in
 * src/common/api-keys.ts, which this script can't import (its tsconfig is
 * rooted at prisma/).
 */
async function seedLocalSiteProxyKey() {
  await prisma.apiConsumer.upsert({
    where: { id: LOCAL_SITE_CONSUMER_ID },
    update: {},
    create: {
      id: LOCAL_SITE_CONSUMER_ID,
      name: "NBA Analytics Web App (first-party, local)",
      rateLimit: LOCAL_SITE_RATE_LIMIT_PER_MINUTE,
      dailyQuota: LOCAL_SITE_DAILY_QUOTA,
    },
  });
  await prisma.apiKey.updateMany({ where: { consumerId: LOCAL_SITE_CONSUMER_ID }, data: { isActive: false } });

  const rawKey = `nba_${randomBytes(32).toString("base64url")}`;
  await prisma.apiKey.create({
    data: {
      consumerId: LOCAL_SITE_CONSUMER_ID,
      keyHash: createHash("sha256").update(rawKey).digest("hex"),
      label: "site-proxy",
    },
  });
  console.log(`Local site-proxy key created. Put this line in apps/web/.env:
  SITE_PROXY_API_KEY=${rawKey}`);
}

async function main() {
  console.log("Seeding mock NBA data...");
  // Archetypes reference Player, not Game, so a re-seed leaves them behind
  // unless they are cleared explicitly — resetGameData would not touch them.
  await resetArchetypeData();
  await resetGameData();
  const teamIdsByAbbreviation = await seedTeams();
  const playersByTeamAbbreviation = await seedPlayers(teamIdsByAbbreviation);
  await seedGamesAndStats(playersByTeamAbbreviation, teamIdsByAbbreviation);
  await seedPostseasonGamesAndStats(playersByTeamAbbreviation, teamIdsByAbbreviation);

  const playersByNbaId = new Map(
    [...playersByTeamAbbreviation.values()]
      .flat()
      .map((player) => [player.nbaPlayerId, player] as const),
  );
  await seedArchetypes(playersByNbaId);
  await seedLocalSiteProxyKey();
  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
