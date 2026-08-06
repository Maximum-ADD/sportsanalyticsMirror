import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Extends PrismaClient directly so every model (user, player, team, ...) is
// available as this.user, this.player, etc. Connects/disconnects alongside
// the Nest module lifecycle rather than lazily on first query, so a bad
// DATABASE_URL fails fast at boot instead of on the first request.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
