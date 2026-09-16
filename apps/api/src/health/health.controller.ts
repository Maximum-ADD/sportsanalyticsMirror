import { Controller, Get, HttpCode } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { DeprecateEndpoint } from "../common/deprecated-endpoint.decorator.js";

const HEALTH_ENDPOINT_SUNSET_AT = "2027-03-31T00:00:00.000Z";
const VERSIONED_HEALTH_ENDPOINT = "/v1/health";

@ApiTags("health")
@Controller()
export class HealthController {
  @Get("v1/health")
  @HttpCode(200)
  @ApiOperation({ summary: "Service health check" })
  @ApiResponse({ status: 200, description: "Service is healthy" })
  checkVersioned() {
    return { status: "ok" };
  }

  @Get("health")
  @HttpCode(200)
  @DeprecateEndpoint({ replacementPath: VERSIONED_HEALTH_ENDPOINT, sunsetAt: HEALTH_ENDPOINT_SUNSET_AT })
  @ApiOperation({ summary: "Service health check (deprecated)", deprecated: true })
  @ApiResponse({ status: 200, description: "Service is healthy" })
  check() {
    return { status: "ok" };
  }
}
