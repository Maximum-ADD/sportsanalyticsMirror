import { Router } from "express";
import * as playerController from "../controllers/playerController.js";
import * as teamController from "../controllers/teamController.js";

export const v1Router = Router();

v1Router.get("/players", playerController.listPlayers);
v1Router.get("/players/:id", playerController.getPlayer);
v1Router.get("/players/:id/stats", playerController.getPlayerStats);

v1Router.get("/teams", teamController.listTeams);
v1Router.get("/teams/:id", teamController.getTeam);
