import { ApiProperty } from "@nestjs/swagger";
import { createPageDto } from "../common/openapi/page.dto.js";

/** One column of a release's CSV, as published in its field schema. */
export class DatasetFieldDto {
  @ApiProperty({ example: "pointsPerGame" }) column!: string;
  @ApiProperty({ enum: ["string", "number", "date"] }) type!: string;
  @ApiProperty({ example: "Average points per game" }) description!: string;
}

/** Who published a release. */
export class DatasetPublisherDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
}

/** OpenAPI model of a versioned dataset release (its metadata; the CSV is at /download). */
export class DatasetReleaseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "2025-26.1", description: "Unique release version" })
  version!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: "2025-26" })
  season!: string;

  @ApiProperty({ description: "SHA-256 of the release CSV, to verify a download" })
  checksum!: string;

  @ApiProperty() gamesCount!: number;
  @ApiProperty() playersCount!: number;
  @ApiProperty() eventsCount!: number;

  @ApiProperty({ type: [DatasetFieldDto], description: "Every CSV column, with its type and meaning" })
  fieldSchema!: DatasetFieldDto[];

  @ApiProperty({ type: String, nullable: true })
  publishedById!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  publishedAt!: string;

  @ApiProperty({ description: "True once a later event correction changed figures this snapshot holds" })
  isStale!: boolean;

  @ApiProperty({ type: DatasetPublisherDto, nullable: true })
  publishedBy!: DatasetPublisherDto | null;
}

export const DatasetReleasePageDto = createPageDto(DatasetReleaseDto, "DatasetReleasePageDto");
