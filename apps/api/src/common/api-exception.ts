import { HttpException, HttpStatus } from "@nestjs/common";

// Every error response uses this envelope: { error: { code, message } }.
export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ error: { code, message } }, status);
  }
}
