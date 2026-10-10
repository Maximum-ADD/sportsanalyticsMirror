import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PlayerDto } from "../players/player.dto.js";
import { LINEUP_SIZE, SALARY_CAP_IN_DOLLARS } from "./lineup-rules.js";

// OpenAPI models for POST /v1/optimizer/solve. Documentation only: the body
// is validated by the zod schema in optimizer.controller.ts, the same way
// every other request body in this API is (see common/parse-body.ts).

/**
 * The most runner-up lineups one solve request may ask for. Kept small: the
 * solver's work grows with every extra lineup it keeps, and a page only has
 * room to compare a few.
 */
export const MAX_ALTERNATIVE_LINEUPS = 4;

/** The rules a solve request may set. Every field is optional; an empty body solves with no locks. */
export class SolveLineupRequestDto {
  @ApiPropertyOptional({
    example: SALARY_CAP_IN_DOLLARS,
    description: `Salary budget in whole dollars. Defaults to ${SALARY_CAP_IN_DOLLARS}.`,
  })
  budget?: number;

  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    description:
      `Players every returned lineup must include. More than ${LINEUP_SIZE}, a player who is also excluded, ` +
      "or a player with no projection is a 400 INFEASIBLE_LINEUP that names the problem.",
  })
  lockedPlayerIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    description: "Players no returned lineup may include.",
  })
  excludedPlayerIds?: string[];

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: MAX_ALTERNATIVE_LINEUPS,
    default: 0,
    example: 3,
    description:
      "How many runner-up lineups to return after the best one, each a different set of players that follows " +
      `the same rules. Whole number from 0 to ${MAX_ALTERNATIVE_LINEUPS}; defaults to 0, the best lineup only.`,
  })
  alternatives?: number;
}

/** The roster rules every lineup follows (see lineup-rules.ts). */
export class LineupRulesDto {
  @ApiProperty({ example: LINEUP_SIZE })
  lineupSize!: number;

  @ApiProperty({ example: 1 })
  minimumGuards!: number;

  @ApiProperty({ example: 1 })
  minimumForwards!: number;
}

/** One player in a solved lineup, priced from their latest projection. */
export class SolvedLineupSlotDto {
  @ApiProperty({ format: "uuid" })
  playerId!: string;

  @ApiProperty({ type: PlayerDto })
  player!: PlayerDto;

  @ApiProperty({ example: 48.25, description: "Projected DraftKings-style fantasy points for the player's next game" })
  predictedFantasyPoints!: number;

  @ApiProperty({ example: 10_700, description: "Synthetic salary derived from the projection, not real DFS pricing" })
  salary!: number;

  @ApiProperty({ description: "True when the request locked this player in" })
  isLocked!: boolean;
}

/** One lineup that meets every rule in the request. */
export class SolvedLineupDto {
  @ApiProperty({ example: 1, description: "1 for the best lineup, 2 for the next best, and so on" })
  rank!: number;

  @ApiProperty({ example: 277.75, description: "Sum of the players' projected fantasy points" })
  totalPredictedPoints!: number;

  @ApiProperty({ example: 50_000 })
  totalSalary!: number;

  @ApiProperty({ type: [SolvedLineupSlotDto], description: "Highest projection first" })
  slots!: SolvedLineupSlotDto[];
}

/** The solved lineups, with the rules they were solved under echoed back. */
export class SolveLineupResponseDto {
  @ApiProperty({ example: SALARY_CAP_IN_DOLLARS })
  budget!: number;

  @ApiProperty({ type: LineupRulesDto })
  rules!: LineupRulesDto;

  @ApiProperty({ type: [String], description: "Deduplicated" })
  lockedPlayerIds!: string[];

  @ApiProperty({ type: [String], description: "Deduplicated" })
  excludedPlayerIds!: string[];

  @ApiProperty({ type: String, format: "date-time", description: "When the newest projection in the pool was written" })
  projectionsAsOf!: string;

  @ApiProperty({
    type: [SolvedLineupDto],
    description:
      "The best lineup first, then up to `alternatives` runners-up in rank order. Fewer come back only when " +
      "fewer lineups meet the rules.",
  })
  lineups!: SolvedLineupDto[];
}
