import { describe, expect, it } from "vitest";
import { parseConsumerBody, parseUpdateConsumerBody } from "./admin-consumers.service.js";

describe("parseConsumerBody", () => {
  it("throws when body is not an object", () => {
    expect(() => parseConsumerBody("string")).toThrow("must be an object");
    expect(() => parseConsumerBody(null)).toThrow("must be an object");
    expect(() => parseConsumerBody(42)).toThrow("must be an object");
  });

  it("throws when name is missing", () => {
    expect(() => parseConsumerBody({})).toThrow("name is required");
    expect(() => parseConsumerBody({ contactEmail: "a@b.com" })).toThrow("name is required");
  });

  it("throws when name is empty or whitespace", () => {
    expect(() => parseConsumerBody({ name: "" })).toThrow("name is required");
    expect(() => parseConsumerBody({ name: "   " })).toThrow("name is required");
  });

  it("returns name only when no optional fields given", () => {
    const result = parseConsumerBody({ name: "  ESPN  " });
    expect(result.name).toBe("ESPN");
    expect(result.contactEmail).toBeUndefined();
    expect(result.rateLimit).toBeUndefined();
    expect(result.dailyQuota).toBeUndefined();
  });

  it("includes optional fields when provided", () => {
    const result = parseConsumerBody({
      name: "ESPN",
      contactEmail: "  api@espn.com  ",
      rateLimit: 120,
      dailyQuota: 5000,
    });
    expect(result.contactEmail).toBe("api@espn.com");
    expect(result.rateLimit).toBe(120);
    expect(result.dailyQuota).toBe(5000);
  });

  it("ignores invalid optional field types", () => {
    const result = parseConsumerBody({
      name: "Test",
      contactEmail: "",
      rateLimit: -5,
      dailyQuota: "not-a-number",
    });
    expect(result.contactEmail).toBeUndefined();
    expect(result.rateLimit).toBeUndefined();
    expect(result.dailyQuota).toBeUndefined();
  });
});

describe("parseUpdateConsumerBody", () => {
  it("throws when body is not an object", () => {
    expect(() => parseUpdateConsumerBody(null)).toThrow("must be an object");
    expect(() => parseUpdateConsumerBody("str")).toThrow("must be an object");
  });

  it("returns empty patch when no fields provided", () => {
    const result = parseUpdateConsumerBody({});
    expect(result).toEqual({});
  });

  it("trims name when provided", () => {
    const result = parseUpdateConsumerBody({ name: "  New Name  " });
    expect(result.name).toBe("New Name");
  });

  it("handles contactEmail null (clear)", () => {
    const result = parseUpdateConsumerBody({ contactEmail: null });
    expect(result.contactEmail).toBeNull();
  });

  it("handles contactEmail string", () => {
    const result = parseUpdateConsumerBody({ contactEmail: "  a@b.com  " });
    expect(result.contactEmail).toBe("a@b.com");
  });

  it("handles contactEmail empty string as null", () => {
    const result = parseUpdateConsumerBody({ contactEmail: "" });
    expect(result.contactEmail).toBeNull();
  });

  it("includes rateLimit, dailyQuota, and isActive when valid", () => {
    const result = parseUpdateConsumerBody({
      rateLimit: 200.5,
      dailyQuota: 1000,
      isActive: false,
    });
    expect(result.rateLimit).toBe(200); // floored
    expect(result.dailyQuota).toBe(1000);
    expect(result.isActive).toBe(false);
  });
});
