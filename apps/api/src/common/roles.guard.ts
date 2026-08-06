import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@prisma/client";
import { ApiException } from "./api-exception.js";
import { ROLES_KEY } from "./roles.decorator.js";

// Reads the Role list set by @Roles(...) on the handler/class (via Reflector)
// and denies the request unless request.user (populated by session auth) has
// one of those roles. A handler with no @Roles(...) is left unrestricted.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowedRoles || allowedRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role: Role } | undefined;
    if (!user || !allowedRoles.includes(user.role)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Insufficient permissions");
    }
    return true;
  }
}
