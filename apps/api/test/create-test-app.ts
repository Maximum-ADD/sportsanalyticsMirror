import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { AllExceptionsFilter } from "../src/common/all-exceptions.filter.js";

// Boots the real Nest routing tree (players/teams/health/not-found) the same
// way main.ts does, minus the BetterAuth/Express wiring around it — none of
// the routes under test require a session, and BetterAuth's own HTTP
// handlers aren't part of what these specs exercise.
export async function createTestApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}
