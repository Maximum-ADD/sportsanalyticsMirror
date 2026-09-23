import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "./api-exception.js";

const SUPPORTED_API_VERSION = "1";
const VERSION_REQUEST_HEADER = "accept-version";
const VERSION_RESPONSE_HEADER = "API-Version";

@Injectable()
export class ApiVersionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ path: string; headers: Record<string, string | undefined> }>();

    if (!request.path.startsWith(`/v${SUPPORTED_API_VERSION}/`)) return true;

    const requestedVersion = request.headers[VERSION_REQUEST_HEADER];
    if (requestedVersion && requestedVersion !== SUPPORTED_API_VERSION) {
      throw new ApiException(HttpStatus.NOT_ACCEPTABLE, "UNSUPPORTED_API_VERSION", `API version ${requestedVersion} is not supported; use version ${SUPPORTED_API_VERSION}`);
    }

    context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>().setHeader(VERSION_RESPONSE_HEADER, SUPPORTED_API_VERSION);
    return true;
  }
}
