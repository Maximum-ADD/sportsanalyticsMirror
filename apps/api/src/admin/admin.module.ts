import { Module } from "@nestjs/common";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminPlayersController } from "./admin-players.controller.js";
import { AdminPlayersService } from "./admin-players.service.js";
import { AdminTeamsController } from "./admin-teams.controller.js";
import { AdminTeamsService } from "./admin-teams.service.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminUsersService } from "./admin-users.service.js";

@Module({
  controllers: [AdminTeamsController, AdminPlayersController, AdminUsersController],
  providers: [AdminTeamsService, AdminPlayersService, AdminUsersService, SessionAuthGuard, RolesGuard],
})
export class AdminModule {}
