import { All, Controller, HttpStatus, Req } from "@nestjs/common";
import type { Request } from "express";
import { ApiException } from "../common/api-exception.js";

// Registered last in AppModule so every real route gets first chance to
// match. Express 5's router (see main.ts on why we're on Express 5 here
// instead of platform-express's bundled Express 4) requires a named
// wildcard rather than a bare '*'.
@Controller()
export class NotFoundController {
  @All("*splat")
  catchAll(@Req() req: Request) {
    throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", `No route for ${req.method} ${req.path}`);
  }
}
