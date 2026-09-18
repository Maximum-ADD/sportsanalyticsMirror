import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// One client shared by every e2e spec file in a given test worker — cheap to
// reuse, and matches how PrismaService behaves in the running app (a single
// long-lived connection rather than one per request).
export const testPrisma = new PrismaClient();

// Raw key the test server stamps onto keyless requests (wired in
// create-test-app.ts) — the e2e stand-in for the production first-party
// proxy key (SITE_PROXY_API_KEY). It only ever exists in the disposable
// test database, so a committed constant is fine.
export const TEST_SITE_PROXY_KEY =
  "nba_ci00000000000000000000000000000000000000000";

const TEST_SITE_CONSUMER_ID = "test-site-proxy";

// The API-consumer row the stamped key must resolve to. Idempotent upsert,
// called from global-setup after migrations and re-called at the end of
// every resetDatabase() — that truncation wipes ApiConsumer/ApiKey too, and
// the next spec's anonymous-shaped requests still need the key to work.
export async function seedTestSiteConsumer(): Promise<void> {
  const keyHash = createHash("sha256").update(TEST_SITE_PROXY_KEY).digest("hex");
  await testPrisma.apiConsumer.upsert({
    where: { id: TEST_SITE_CONSUMER_ID },
    update: {},
    create: {
      id: TEST_SITE_CONSUMER_ID,
      name: "Test site proxy",
      rateLimit: 1000,
      dailyQuota: 1_000_000,
    },
  });
  await testPrisma.apiKey.upsert({
    where: { keyHash },
    update: {},
    create: {
      consumerId: TEST_SITE_CONSUMER_ID,
      keyHash,
      label: "site-proxy",
    },
  });
}

// Deletes every row seeded by a test, in FK-safe order, without touching
// schema/migrations. Call from afterEach so specs never depend on leftover
// state from a previous test.
export async function resetDatabase() {
  // Personalization rows first — they reference Player/Team/Game/User, and
  // their own join rows (SavedComparisonPlayer, SavedLineupSlot) reference
  // their parents, so both layers have to go before anything below.
  await testPrisma.savedComparisonPlayer.deleteMany();
  await testPrisma.savedLineupSlot.deleteMany();
  await testPrisma.savedComparison.deleteMany();
  await testPrisma.savedLineup.deleteMany();
  await testPrisma.gamePick.deleteMany();

  await testPrisma.lineupSlot.deleteMany();
  await testPrisma.lineup.deleteMany();
  await testPrisma.playerPrediction.deleteMany();
  await testPrisma.gamePrediction.deleteMany();
  await testPrisma.gamePredictionRun.deleteMany();

  // Brief-feature tables — must go before Game/User because of FK refs.
  await testPrisma.eventCorrection.deleteMany();
  await testPrisma.apiUsageLog.deleteMany();
  await testPrisma.apiKey.deleteMany();
  await testPrisma.apiConsumer.deleteMany();
  await testPrisma.datasetRelease.deleteMany();
  await testPrisma.ingestionRequest.deleteMany();
  await testPrisma.ingestionWorker.deleteMany();
  await testPrisma.ingestionSchedule.deleteMany();
  await testPrisma.ingestionBatch.deleteMany();

  await testPrisma.playerGameStat.deleteMany();
  await testPrisma.gameEvent.deleteMany();
  await testPrisma.game.deleteMany();
  await testPrisma.userFollowedPlayer.deleteMany();
  await testPrisma.player.deleteMany();
  await testPrisma.team.deleteMany();
  await testPrisma.session.deleteMany();
  await testPrisma.account.deleteMany();
  await testPrisma.verification.deleteMany();
  await testPrisma.user.deleteMany();

  // The truncation above also removed the consumer the test app's proxy
  // stand-in stamps its key for — put it back for the next spec.
  await seedTestSiteConsumer();
}
