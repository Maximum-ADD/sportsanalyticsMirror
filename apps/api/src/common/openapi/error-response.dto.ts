import { ApiProperty } from "@nestjs/swagger";

/** The error object inside every error response (see AllExceptionsFilter). */
export class ErrorDetailDto {
  @ApiProperty({ example: "NOT_FOUND", description: "Stable, machine-readable error code" })
  code!: string;

  @ApiProperty({ example: "Player not found", description: "Human-readable explanation" })
  message!: string;
}

/** The single error envelope every failing request returns. */
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto })
  error!: ErrorDetailDto;
}
