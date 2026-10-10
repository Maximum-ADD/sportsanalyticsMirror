import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Observable } from "rxjs";
import { DEPRECATION_NOTICE_KEY, type DeprecationNotice } from "./deprecated-endpoint.decorator.js";

const SUCCESSOR_VERSION_RELATION = "successor-version";

// Adds lifecycle headers only to routes explicitly marked with
// @DeprecateEndpoint, leaving every other response unchanged.
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const deprecationNotice = this.reflector.getAllAndOverride<DeprecationNotice>(DEPRECATION_NOTICE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (deprecationNotice) {
      const response = context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>();
      const sunsetDate = new Date(deprecationNotice.sunsetAt);

      response.setHeader("Deprecation", `@${Math.floor(sunsetDate.getTime() / 1_000)}`);
      response.setHeader("Sunset", sunsetDate.toUTCString());
      response.setHeader("Link", `<${deprecationNotice.replacementPath}>; rel="${SUCCESSOR_VERSION_RELATION}"`);
    }

    return next.handle();
  }
}
