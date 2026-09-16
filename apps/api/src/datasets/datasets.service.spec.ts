import { describe, expect, it } from "vitest";
import { escapeCsvField } from "./datasets.service.js";

describe("escapeCsvField", () => {
  it("returns empty string for null", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  it("returns plain text as-is when no special characters", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField(42)).toBe("42");
    expect(escapeCsvField(3.14)).toBe("3.14");
  });

  it("wraps in double quotes when text contains a comma", () => {
    expect(escapeCsvField("hello, world")).toBe('"hello, world"');
  });

  it("wraps in double quotes when text contains a double quote (and escapes it)", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in double quotes when text contains a newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps in double quotes when text contains a carriage return", () => {
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });
});
