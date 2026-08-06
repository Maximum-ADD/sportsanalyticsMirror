import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "./api-exception.js";

// Denies the request unless Passport's session middleware has already
// attached and authenticated a user on it. Does not check role — see
// RolesGuard for that.
@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.isAuthenticated?.()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Sign in required");
    }
    return true;
  }
}
