import type { Request, Response, NextFunction } from "express";
import { getPathParam } from "../lib/params.js";
import * as playerService from "../services/playerService.js";
import * as statsService from "../services/statsService.js";

export async function listPlayers(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await playerService.getPlayers(req.query as Record<string, unknown>);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPlayer(req: Request, res: Response, next: NextFunction) {
  try {
    const playerId = getPathParam(req.params.id);
    const player = await playerService.getPlayerById(playerId);
    if (!player) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Player not found" } });
      return;
    }
    res.status(200).json(player);
  } catch (error) {
    next(error);
  }
}

export async function getPlayerStats(req: Request, res: Response, next: NextFunction) {
  try {
    const playerId = getPathParam(req.params.id);
    const player = await playerService.getPlayerById(playerId);
    if (!player) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Player not found" } });
      return;
    }

    const [seasonAverages, gameLog] = await Promise.all([
      statsService.getPlayerSeasonAverages(playerId),
      statsService.getPlayerGameLog(playerId),
    ]);
    res.status(200).json({ playerId, seasonAverages, gameLog });
  } catch (error) {
    next(error);
  }
}
