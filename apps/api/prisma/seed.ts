import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MOCK_TEAMS = [
  { nbaTeamId: 1610612747, name: "Lakers", abbreviation: "LAL", city: "Los Angeles", conference: "West", division: "Pacific" },
  { nbaTeamId: 1610612738, name: "Celtics", abbreviation: "BOS", city: "Boston", conference: "East", division: "Atlantic" },
  { nbaTeamId: 1610612744, name: "Warriors", abbreviation: "GSW", city: "Golden State", conference: "West", division: "Pacific" },
  { nbaTeamId: 1610612749, name: "Bucks", abbreviation: "MIL", city: "Milwaukee", conference: "East", division: "Central" },
];

const MOCK_PLAYERS = [
  { nbaPlayerId: 2544, firstName: "LeBron", lastName: "James", position: "F", heightInches: 81, weightLbs: 250, jerseyNumber: "23", teamAbbreviation: "LAL" },
  { nbaPlayerId: 201939, firstName: "Stephen", lastName: "Curry", position: "G", heightInches: 74, weightLbs: 185, jerseyNumber: "30", teamAbbreviation: "GSW" },
  { nbaPlayerId: 1628369, firstName: "Jayson", lastName: "Tatum", position: "F", heightInches: 80, weightLbs: 210, jerseyNumber: "0", teamAbbreviation: "BOS" },
  { nbaPlayerId: 203507, firstName: "Giannis", lastName: "Antetokounmpo", position: "F", heightInches: 83, weightLbs: 243, jerseyNumber: "34", teamAbbreviation: "MIL" },
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
  const players = [];
  for (const player of MOCK_PLAYERS) {
    const { teamAbbreviation, ...playerData } = player;
    const created = await prisma.player.upsert({
      where: { nbaPlayerId: player.nbaPlayerId },
      update: {},
      create: { ...playerData, teamId: teamIdsByAbbreviation.get(teamAbbreviation) },
    });
    players.push(created);
  }
  return players;
}

async function seedGamesAndStats(players: Awaited<ReturnType<typeof seedPlayers>>, teamIdsByAbbreviation: Map<string, string>) {
  const [lakersId, celticsId] = [teamIdsByAbbreviation.get("LAL")!, teamIdsByAbbreviation.get("BOS")!];

  for (let gameIndex = 0; gameIndex < 5; gameIndex++) {
    const gameDate = new Date(2025, 10, 1 + gameIndex * 3);
    const game = await prisma.game.upsert({
      where: { nbaGameId: `MOCK-GAME-${gameIndex}` },
      update: {},
      create: {
        nbaGameId: `MOCK-GAME-${gameIndex}`,
        gameDate,
        season: "2025-26",
        homeTeamId: lakersId,
        awayTeamId: celticsId,
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

    for (const player of players) {
      await prisma.playerGameStat.upsert({
        where: { playerId_gameId: { playerId: player.id, gameId: game.id } },
        update: {},
        create: { playerId: player.id, gameId: game.id, ...generateBoxScore() },
      });
    }
  }
}

async function main() {
  console.log("Seeding mock NBA data...");
  const teamIdsByAbbreviation = await seedTeams();
  const players = await seedPlayers(teamIdsByAbbreviation);
  await seedGamesAndStats(players, teamIdsByAbbreviation);
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
