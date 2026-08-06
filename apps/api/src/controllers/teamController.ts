import type { Request, Response, NextFunction } from "express";
import { getPathParam } from "../lib/params.js";
import * as teamService from "../services/teamService.js";

export async function listTeams(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await teamService.getTeams(req.query as Record<string, unknown>);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getTeam(req: Request, res: Response, next: NextFunction) {
  try {
    const team = await teamService.getTeamById(getPathParam(req.params.id));
    if (!team) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Team not found" } });
      return;
    }
    res.status(200).json(team);
  } catch (error) {
    next(error);
  }
}
