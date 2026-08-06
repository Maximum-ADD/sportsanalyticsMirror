import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

function isApiErrorBody(body: unknown): body is { error: { code: string; message: string } } {
  return typeof body === "object" && body !== null && "error" in body;
}

// Normalises every thrown error into the { error: { code, message } }
// envelope: ApiException bodies are already in that shape and pass through
// unchanged; other HttpExceptions (e.g. Nest's own validation errors) are
// wrapped with a generic HTTP_ERROR code; anything else is an unexpected
// failure, logged and reported as a 500 INTERNAL_ERROR.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isApiErrorBody(body)) {
        response.status(status).json(body);
        return;
      }
      const message = typeof body === "string" ? body : exception.message;
      response.status(status).json({ error: { code: "HTTP_ERROR", message } });
      return;
    }

    console.error(exception);
    const message = exception instanceof Error ? exception.message : "Unexpected server error";
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: "INTERNAL_ERROR", message } });
  }
}
