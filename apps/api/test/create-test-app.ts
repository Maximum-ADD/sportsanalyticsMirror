import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import expressFactory from "express";
import { AppModule } from "../src/app.module.js";
import { AllExceptionsFilter } from "../src/common/all-exceptions.filter.js";

// Boots the real Nest routing tree (players/teams/games/health/not-found)
// on the same Express 5 instance + ExpressAdapter setup as main.ts, rather
// than letting NestFactory.create() fall back to its own bundled Express 4.
// That distinction matters: NotFoundController's catch-all route uses
// Express 5's "*splat" wildcard syntax (see its own comment for why), which
// silently fails to match anything under Express 4 — a mismatch that only
// showed up once these specs were actually wired into the test run.
// BetterAuth's own HTTP handlers aren't needed here: protected endpoint
// specs mock the guard's session lookup directly.
export async function createTestApp(): Promise<INestApplication> {
  const server = expressFactory();
  server.use(expressFactory.json());

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), { logger: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}
