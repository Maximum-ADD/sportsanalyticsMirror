import { ApiProperty } from "@nestjs/swagger";
import { createPageDto } from "../common/openapi/page.dto.js";

/** OpenAPI model of a Team row, as GET /v1/teams and every embedded team return it. */
export class TeamDto {
  @ApiProperty({ format: "uuid", description: "Stable platform id; never reused" })
  id!: string;

  @ApiProperty({ example: 1610612743, description: "NBA.com team id" })
  nbaTeamId!: number;

  @ApiProperty({ example: "Nuggets" })
  name!: string;

  @ApiProperty({ example: "DEN" })
  abbreviation!: string;

  @ApiProperty({ example: "Denver" })
  city!: string;

  @ApiProperty({ example: "West" })
  conference!: string;

  @ApiProperty({ example: "Northwest" })
  division!: string;

  @ApiProperty({ type: String, nullable: true, description: "Logo URL, when one is stored" })
  logoUrl!: string | null;
}

export const TeamPageDto = createPageDto(TeamDto, "TeamPageDto");
