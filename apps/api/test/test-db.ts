import { PrismaClient } from "@prisma/client";

// One client shared by every e2e spec file in a given test worker — cheap to
// reuse, and matches how PrismaService behaves in the running app (a single
// long-lived connection rather than one per request).
export const testPrisma = new PrismaClient();

// Deletes every row seeded by a test, in FK-safe order, without touching
// schema/migrations. Call from afterEach so specs never depend on leftover
// state from a previous test.
export async function resetDatabase() {
  await testPrisma.lineupSlot.deleteMany();
  await testPrisma.lineup.deleteMany();
  await testPrisma.playerPrediction.deleteMany();
  await testPrisma.playerGameStat.deleteMany();
  await testPrisma.gameEvent.deleteMany();
  await testPrisma.game.deleteMany();
  await testPrisma.player.deleteMany();
  await testPrisma.team.deleteMany();
  await testPrisma.session.deleteMany();
  await testPrisma.account.deleteMany();
  await testPrisma.verification.deleteMany();
  await testPrisma.user.deleteMany();
}
