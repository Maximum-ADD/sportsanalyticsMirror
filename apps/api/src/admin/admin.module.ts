import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminAnomaliesController } from "./admin-anomalies.controller.js";
import { AdminAnomaliesService } from "./admin-anomalies.service.js";
import { AdminBatchesController } from "./admin-batches.controller.js";
import { AdminBatchesService } from "./admin-batches.service.js";
import { AdminConsumersController } from "./admin-consumers.controller.js";
import { AdminConsumersService } from "./admin-consumers.service.js";
import { AdminEventsController } from "./admin-events.controller.js";
import { AdminEventsService } from "./admin-events.service.js";
import { AdminGamesController } from "./admin-games.controller.js";
import { AdminGamesService } from "./admin-games.service.js";
import { AdminIngestionController } from "./admin-ingestion.controller.js";
import { AdminIngestionService } from "./admin-ingestion.service.js";
import { AdminPlayersController } from "./admin-players.controller.js";
import { AdminPlayersService } from "./admin-players.service.js";
import { AdminTeamsController } from "./admin-teams.controller.js";
import { AdminTeamsService } from "./admin-teams.service.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminUsersService } from "./admin-users.service.js";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [
    AdminTeamsController,
    AdminPlayersController,
    AdminUsersController,
    AdminEventsController,
    AdminGamesController,
    AdminBatchesController,
    AdminConsumersController,
    AdminIngestionController,
    AdminAnomaliesController,
  ],
  providers: [
    AdminTeamsService,
    AdminPlayersService,
    AdminUsersService,
    AdminEventsService,
    AdminGamesService,
    AdminBatchesService,
    AdminConsumersService,
    AdminIngestionService,
    AdminAnomaliesService,
    SessionAuthGuard,
    RolesGuard,
  ],
})
export class AdminModule {}
