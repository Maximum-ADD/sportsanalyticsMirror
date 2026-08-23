import { PrismaClient } from "@prisma/client";

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

  return {
    minutes: 30 + Math.floor(Math.random() * 10),
    points,
    rebounds: 3 + Math.floor(Math.random() * 9),
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

// Every pair of seeded teams plays each other twice (home and away), so
// every team — not just one — ends up with a full slate of games and every
// player on every roster has real per-game boxscores to derive stats from.
async function seedGamesAndStats(
  playersByTeamAbbreviation: Map<string, Awaited<ReturnType<typeof prisma.player.upsert>>[]>,
  teamIdsByAbbreviation: Map<string, string>
) {
  const teamAbbreviations = [...teamIdsByAbbreviation.keys()];
  const fixtures = [
    ...roundRobinPairs(teamAbbreviations),
    ...roundRobinPairs(teamAbbreviations).map(([home, away]): [string, string] => [away, home]),
  ];

  for (const [gameIndex, [homeAbbreviation, awayAbbreviation]] of fixtures.entries()) {
    const gameDate = new Date(2025, SEASON_START_MONTH_INDEX, SEASON_START_DAY + gameIndex * DAYS_BETWEEN_GAMES);
    const game = await prisma.game.upsert({
      where: { nbaGameId: `MOCK-GAME-${gameIndex}` },
      update: {},
      create: {
        nbaGameId: `MOCK-GAME-${gameIndex}`,
        gameDate,
        season: SEASON,
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
}

// Game/GameEvent/PlayerGameStat are cleared and fully regenerated on every
// run, rather than upserted like teams/players, because which fixture a
// given nbaGameId maps to is a function of this script's fixture-generation
// logic — upserting would leave stale rows from a previous run's schedule
// mismatched against the current one.
async function resetGameData() {
  await prisma.playerGameStat.deleteMany();
  await prisma.gameEvent.deleteMany();
  await prisma.game.deleteMany();
}

async function main() {
  console.log("Seeding mock NBA data...");
  await resetGameData();
  const teamIdsByAbbreviation = await seedTeams();
  const playersByTeamAbbreviation = await seedPlayers(teamIdsByAbbreviation);
  await seedGamesAndStats(playersByTeamAbbreviation, teamIdsByAbbreviation);
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
