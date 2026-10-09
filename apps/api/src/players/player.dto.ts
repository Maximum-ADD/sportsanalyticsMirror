import { ApiProperty } from "@nestjs/swagger";
import { createPageDto } from "../common/openapi/page.dto.js";
import { TeamDto } from "../teams/team.dto.js";

/** OpenAPI model of a Player row with its current team, as the player list and detail return it. */
export class PlayerDto {
  @ApiProperty({ format: "uuid", description: "Stable platform id; never reused" })
  id!: string;

  @ApiProperty({ example: 203999, description: "NBA.com player id" })
  nbaPlayerId!: number;

  @ApiProperty({ example: "Nikola" })
  firstName!: string;

  @ApiProperty({ example: "Jokić" })
  lastName!: string;

  @ApiProperty({ example: "C", description: "Listed position code" })
  position!: string;

  @ApiProperty({ type: Number, nullable: true, example: 83 })
  heightInches!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 284 })
  weightLbs!: number | null;

  @ApiProperty({ type: String, nullable: true, example: "15" })
  jerseyNumber!: string | null;

  @ApiProperty({ type: String, nullable: true })
  headshotUrl!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true, description: "Current team; null for a free agent" })
  teamId!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  birthDate!: string | null;

  @ApiProperty({ type: String, nullable: true })
  school!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Serbia" })
  country!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastAffiliation!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: "Seasons of NBA experience" })
  seasonExp!: number | null;

  @ApiProperty({ type: String, nullable: true, example: "Active" })
  rosterStatus!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 2014 })
  draftYear!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 2 })
  draftRound!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 41 })
  draftNumber!: number | null;

  @ApiProperty({ type: TeamDto, nullable: true })
  team!: TeamDto | null;
}

export const PlayerPageDto = createPageDto(PlayerDto, "PlayerPageDto");
