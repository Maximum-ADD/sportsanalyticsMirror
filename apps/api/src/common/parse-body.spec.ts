import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiException } from "./api-exception.js";
import { parseBody, parseQueryParams } from "./parse-body.js";

const followPlayerSchema = z.object({
  playerId: z.string().min(1),
  note: z.string().max(200).optional(),
});

// Pulls the { error: { code, message } } envelope back out of a thrown
// ApiException so assertions can read the code and message directly.
function captureErrorBody(run: () => unknown): { status: number; code: string; message: string } {
  try {
    run();
  } catch (error) {
    const apiException = error as ApiException;
    const body = apiException.getResponse() as { error: { code: string; message: string } };
    return { status: apiException.getStatus(), code: body.error.code, message: body.error.message };
  }
  throw new Error("Expected the call to throw, but it returned normally");
}

describe("parseBody", () => {
  it("returns the parsed body when it matches the schema", () => {
    const body = { playerId: "player-1", note: "watch his 3PT%" };
    expect(parseBody(followPlayerSchema, body)).toEqual(body);
  });

  it("strips properties the schema does not declare", () => {
    const parsed = parseBody(followPlayerSchema, { playerId: "player-1", isAdmin: true });
    expect(parsed).toEqual({ playerId: "player-1" });
  });

  it("throws an ApiException for a body missing a required field", () => {
    expect(() => parseBody(followPlayerSchema, {})).toThrow(ApiException);
  });

  it("reports the failure as a 400 BAD_REQUEST naming the offending field", () => {
    const { status, code, message } = captureErrorBody(() => parseBody(followPlayerSchema, {}));
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(code).toBe("BAD_REQUEST");
    expect(message).toContain("request body");
    expect(message).toContain("playerId");
  });

  it("reports at most three issues, however many fields are wrong", () => {
    const fiveFieldSchema = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
    });
    const { message } = captureErrorBody(() => parseBody(fiveFieldSchema, {}));
    expect(message.split(";")).toHaveLength(3);
  });

  it("rejects a non-object body (null, array, string) rather than coercing it", () => {
    expect(() => parseBody(followPlayerSchema, null)).toThrow(ApiException);
    expect(() => parseBody(followPlayerSchema, [])).toThrow(ApiException);
    expect(() => parseBody(followPlayerSchema, "player-1")).toThrow(ApiException);
  });

  it("describes a whole-body failure without a field prefix", () => {
    const { message } = captureErrorBody(() => parseBody(followPlayerSchema, null));
    expect(message.startsWith("Invalid request body: ")).toBe(true);
    expect(message).not.toContain(": :");
  });

  it("applies schema defaults and leaves optional fields absent", () => {
    const schemaWithDefault = z.object({ isPrimary: z.boolean().default(false) });
    expect(parseBody(schemaWithDefault, {})).toEqual({ isPrimary: false });
    expect(parseBody(followPlayerSchema, { playerId: "player-1" })).toEqual({ playerId: "player-1" });
  });
});

describe("parseQueryParams", () => {
  it("returns coerced values when the query matches the schema", () => {
    const schema = z.object({ season: z.string(), limit: z.coerce.number().int() });
    expect(parseQueryParams(schema, { season: "2024-25", limit: "10" })).toEqual({
      season: "2024-25",
      limit: 10,
    });
  });

  it("throws a 400 naming the query parameters as the subject", () => {
    const schema = z.object({ limit: z.coerce.number().int() });
    const { status, message } = captureErrorBody(() => parseQueryParams(schema, { limit: "abc" }));
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(message).toContain("query parameters");
  });
});
