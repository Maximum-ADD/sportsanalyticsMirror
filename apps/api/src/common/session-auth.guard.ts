import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth.config.js";
import { ApiException } from "./api-exception.js";

// Denies the request unless BetterAuth recognises a valid session cookie on
// it. On success, attaches the session's user onto request.user so
// downstream guards (RolesGuard) and controllers can read it the same way
// they did under the old Passport-based session.
@Injectable()
export class SessionAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!result) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Sign in required");
    }
    request.user = result.user;
    return true;
  }
}
