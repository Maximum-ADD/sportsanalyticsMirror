import { HttpException, HttpStatus, type ArgumentsHost } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "./api-exception.js";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";

function createHost() {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe("AllExceptionsFilter", () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it("passes an ApiException's { error } body through unchanged", () => {
    const { host, response } = createHost();
    const exception = new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith({ error: { code: "NOT_FOUND", message: "Player not found" } });
  });

  it("wraps a plain Nest HttpException in the { error } envelope with a generic code", () => {
    const { host, response } = createHost();
    const exception = new HttpException("Validation failed", HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({ error: { code: "HTTP_ERROR", message: "Validation failed" } });
  });

  it("wraps an HttpException whose response body is an unrecognised object", () => {
    const { host, response } = createHost();
    const exception = new HttpException({ some: "shape" }, HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: "HTTP_ERROR", message: exception.message },
    });
  });

  it("reports an unexpected Error as a 500 INTERNAL_ERROR without leaking a stack trace", () => {
    const { host, response } = createHost();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    filter.catch(new Error("db connection lost"), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "db connection lost" },
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("reports a non-Error thrown value with a generic message", () => {
    const { host, response } = createHost();
    vi.spyOn(console, "error").mockImplementation(() => {});

    filter.catch("a thrown string", host);

    expect(response.json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    });
  });
});
