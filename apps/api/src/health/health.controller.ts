import { Controller, Get, HttpCode } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: "Service health check" })
  @ApiResponse({ status: 200, description: "Service is healthy" })
  check() {
    return { status: "ok" };
  }
}
