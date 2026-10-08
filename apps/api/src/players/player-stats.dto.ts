import { ApiProperty } from "@nestjs/swagger";
import { SeasonType } from "@prisma/client";

/**
 * OpenAPI model of DerivedSeasonAverages: per-game averages derived at
 * request time from the player's box-score rows, which are themselves
 * summed from play-by-play events. Percentages are 0-100.
 */
export class SeasonAveragesDto {
  @ApiProperty({ example: 65 }) gamesPlayed!: number;
  @ApiProperty({ example: 34.9 }) minutesPerGame!: number;
  @ApiProperty({ example: 27.8 }) pointsPerGame!: number;
  @ApiProperty({ example: 12.6 }) reboundsPerGame!: number;
  @ApiProperty({ example: 9.9 }) assistsPerGame!: number;
  @ApiProperty({ example: 1.5 }) stealsPerGame!: number;
  @ApiProperty({ example: 0.8 }) blocksPerGame!: number;
  @ApiProperty({ example: 3.3 }) turnoversPerGame!: number;
  @ApiProperty({ example: 10.5 }) fieldGoalsMadePerGame!: number;
  @ApiProperty({ example: 18.3 }) fieldGoalsAttemptedPerGame!: number;
  @ApiProperty({ example: 57.6 }) fieldGoalPercentage!: number;
  @ApiProperty({ example: 1.6 }) threesMadePerGame!: number;
  @ApiProperty({ example: 4 }) threesAttemptedPerGame!: number;
  @ApiProperty({ example: 38.9 }) threePointPercentage!: number;
  @ApiProperty({ example: 5.2 }) freeThrowsMadePerGame!: number;
  @ApiProperty({ example: 6.4 }) freeThrowsAttemptedPerGame!: number;
  @ApiProperty({ example: 81.7 }) freeThrowPercentage!: number;
  @ApiProperty({ example: 66 }) trueShootingPercentage!: number;
  @ApiProperty({ example: 61.9 }) effectiveFieldGoalPercentage!: number;

  @ApiProperty({ type: Number, nullable: true, description: "Null with no turnovers to divide by" })
  assistToTurnoverRatio!: number | null;

  // The four below come from the official box score rather than events,
  // and older rows never recorded them: null means "not recorded", not 0.
  @ApiProperty({ type: Number, nullable: true, description: "Null when no game recorded it" })
  plusMinusPerGame!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "Null when no game recorded it" })
  usagePercentage!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "Null when no game recorded it" })
  offensiveRating!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "Null when no game recorded it" })
  defensiveRating!: number | null;
}

/** One game in a player's points log. */
export class GameLogEntryDto {
  @ApiProperty({ format: "uuid" }) gameId!: string;
  @ApiProperty({ type: String, format: "date-time" }) gameDate!: string;
  @ApiProperty({ example: 31 }) points!: number;
  @ApiProperty({ example: "2025-26", description: "League year the game belongs to" }) season!: string;
}

/** What GET /v1/players/{id}/stats returns. */
export class PlayerStatsDto {
  @ApiProperty({ format: "uuid" })
  playerId!: string;

  @ApiProperty({ enum: Object.values(SeasonType), description: "The segment the figures cover, echoed back" })
  seasonType!: SeasonType;

  @ApiProperty({
    type: String,
    format: "date-time",
    required: false,
    description: "Present when the request passed asOf: only games finished by then were counted",
  })
  asOf?: string;

  @ApiProperty({ type: SeasonAveragesDto })
  seasonAverages!: SeasonAveragesDto;

  @ApiProperty({ type: [GameLogEntryDto], description: "Every counted game, oldest first" })
  gameLog!: GameLogEntryDto[];
}
