import { ApiProperty } from "@nestjs/swagger";
import { SeasonType } from "@prisma/client";
import { createPageDto } from "../common/openapi/page.dto.js";
import { TeamDto } from "../teams/team.dto.js";

/** The latest model's prediction for a game (apps/predictor). */
export class GamePredictionDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) gameId!: string;
  @ApiProperty({ example: 0.5846, description: "Elo home win probability, 0-1" }) homeWinProbability!: number;
  @ApiProperty({ example: 1612.4, description: "Home team's Elo rating before the game" }) homeTeamEloPre!: number;
  @ApiProperty({ example: 1548.9, description: "Away team's Elo rating before the game" }) awayTeamEloPre!: number;

  @ApiProperty({ type: Number, nullable: true, example: 1.86, description: "Four Factors predicted home margin" })
  predictedMarginHome!: number | null;

  @ApiProperty({ type: String, nullable: true, example: "regression" })
  marginMethod!: string | null;

  @ApiProperty({
    example: "unversioned",
    description: "The model version that produced this prediction (\"unversioned\" for runs from before model versioning)",
  })
  modelVersion!: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

/** Bookmakers' de-vigged, averaged home win probability (The Odds API). */
export class GameMarketOddsDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) gameId!: string;
  @ApiProperty({ example: 0.61, description: "0-1" }) homeWinProbability!: number;
  @ApiProperty({ example: 8 }) bookmakerCount!: number;
  @ApiProperty({ example: "the-odds-api" }) source!: string;
  @ApiProperty({ type: String, format: "date-time" }) fetchedAt!: string;
}

/** OpenAPI model of a Game row as GET /v1/games returns it. */
export class GameDto {
  @ApiProperty({ format: "uuid", description: "Stable platform id; never reused" })
  id!: string;

  @ApiProperty({ example: "0022500123", description: "NBA.com game id" })
  nbaGameId!: string;

  @ApiProperty({ type: String, format: "date-time" })
  gameDate!: string;

  @ApiProperty({ example: "2025-26" })
  season!: string;

  @ApiProperty({ format: "uuid" })
  homeTeamId!: string;

  @ApiProperty({ format: "uuid" })
  awayTeamId!: string;

  @ApiProperty({ type: Number, nullable: true, description: "Null until the game is played" })
  homeScore!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "Null until the game is played" })
  awayScore!: number | null;

  @ApiProperty({ enum: Object.values(SeasonType) })
  seasonType!: SeasonType;

  @ApiProperty({ type: Number, nullable: true, description: "1-4 for playoff and Finals games, null otherwise" })
  playoffRound!: number | null;

  @ApiProperty({ type: TeamDto })
  homeTeam!: TeamDto;

  @ApiProperty({ type: TeamDto })
  awayTeam!: TeamDto;

  @ApiProperty({ type: GamePredictionDto, nullable: true })
  prediction!: GamePredictionDto | null;

  @ApiProperty({ type: GameMarketOddsDto, nullable: true })
  marketOdds!: GameMarketOddsDto | null;
}

export const GamePageDto = createPageDto(GameDto, "GamePageDto");
