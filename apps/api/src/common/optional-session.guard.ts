import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth.config.js";

// Attaches the session's user onto request.user when the request carries a
// valid session cookie, but never rejects the request when it doesn't.
// Listed before ApiKeyGuard on the public read controllers so signed-in
// visitors are recognised as themselves (and skip the key check entirely)
// while anonymous callers fall through to the API-key requirement.
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (result) {
      request.user = result.user;
    }
    return true;
  }
}
