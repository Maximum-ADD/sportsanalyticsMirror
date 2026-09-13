import { Global, Module } from "@nestjs/common";
import { ResponseCacheService } from "./response-cache.service.js";

// Global like PrismaModule: every read service that caches shares one
// instance, and one instance is what makes cross-service invalidation work
// (PicksService clearing a key LeaderboardService filled).
@Global()
@Module({
  providers: [ResponseCacheService],
  exports: [ResponseCacheService],
})
export class ResponseCacheModule {}
