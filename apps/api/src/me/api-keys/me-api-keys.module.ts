import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import { MeApiKeysController } from "./me-api-keys.controller.js";
import { MeApiKeysService } from "./me-api-keys.service.js";

// The signed-in user's own API keys (/v1/me/api-keys). Keys live on the
// same ApiConsumer/ApiKey tables as the admin-managed external consumers
// — a user's first key auto-provisions their personal consumer — so the
// ApiKeyGuard, rate limiting and usage logging all apply unchanged; this
// module only adds the user-scoped way to mint and manage them.
@Module({
  controllers: [MeApiKeysController],
  providers: [MeApiKeysService, SessionAuthGuard],
})
export class MeApiKeysModule {}
