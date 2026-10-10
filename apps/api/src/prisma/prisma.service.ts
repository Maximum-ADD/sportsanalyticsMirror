import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Set PRISMA_LOG_QUERIES=true to print every SQL statement this client runs.
// Off by default; it exists to count how many round trips a page load
// really costs against the pooler, e.g. before and after a caching change.
const shouldLogQueries = process.env.PRISMA_LOG_QUERIES === "true";

// Extends PrismaClient directly so every model (user, player, team, ...) is
// available as this.user, this.player, etc. Connects/disconnects alongside
// the Nest module lifecycle rather than lazily on first query, so a bad
// DATABASE_URL fails fast at boot instead of on the first request.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(shouldLogQueries ? { log: ["query"] } : undefined);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
