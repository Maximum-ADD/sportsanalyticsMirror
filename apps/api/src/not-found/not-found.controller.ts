import { All, Controller, HttpStatus, Req } from "@nestjs/common";
import type { Request } from "express";
import { ApiException } from "../common/api-exception.js";

// Registered last in AppModule so every real route gets first chance to match.
@Controller()
export class NotFoundController {
  @All("*")
  catchAll(@Req() req: Request) {
    throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", `No route for ${req.method} ${req.path}`);
  }
}
