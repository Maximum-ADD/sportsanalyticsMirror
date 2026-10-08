import { ApiProperty } from "@nestjs/swagger";
import { createPageDto } from "../common/openapi/page.dto.js";

/**
 * OpenAPI model of one play-by-play GameEvent: the record every published
 * statistic is derived from, tagged with the ingestion batch that wrote it.
 */
export class GameEventDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  gameId!: string;

  @ApiProperty({ example: 42, description: "NBA actionNumber; strictly increasing within a game" })
  sequence!: number;

  @ApiProperty({ example: 1 })
  period!: number;

  @ApiProperty({ example: "PT07M12.00S", description: "Game clock as an ISO-8601 duration" })
  clock!: string;

  @ApiProperty({ example: "2pt", description: "NBA actionType, e.g. 2pt, 3pt, freethrow, rebound, turnover" })
  eventType!: string;

  @ApiProperty({ type: String, nullable: true, example: "offensive" })
  subType!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true, description: "Null for a team-level action" })
  playerId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  teamId!: string | null;

  @ApiProperty({ type: Boolean, nullable: true, description: "Made or missed; shots and free throws only" })
  success!: boolean | null;

  @ApiProperty({ type: Number, nullable: true, description: "Points scored by a made shot or free throw" })
  value!: number | null;

  @ApiProperty({ example: "Jokić 15' Driving Floating Jump Shot (12 PTS)" })
  description!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true, description: "The ingestion batch (submission) that wrote this event" })
  batchId!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

export const GameEventPageDto = createPageDto(GameEventDto, "GameEventPageDto");
