import { Global, Module } from "@nestjs/common";
import { ExportRequestsController } from "./export-requests.controller.js";
import { ExportRequestsService } from "./export-requests.service.js";

// Global, like ApiKeyAccessModule: exactly one ExportRequestsService for
// the whole app, since its @Cron worker must see every queued request
// regardless of which resource module registered the builder for it.
@Global()
@Module({
  controllers: [ExportRequestsController],
  providers: [ExportRequestsService],
  exports: [ExportRequestsService],
})
export class ExportRequestsModule {}
