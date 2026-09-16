import { describe, expect, it } from "vitest";
import { validateStatisticExpression } from "./expression-validator.js";

describe("validateStatisticExpression", () => {
  it("accepts arithmetic using supported statistics", () => {
    expect(() => validateStatisticExpression("points + rebounds * 2 - turnovers")).not.toThrow();
  });

  it("rejects an unsupported statistic", () => {
    expect(() => validateStatisticExpression("points + salary")).toThrow("unsupported statistic: salary");
  });

  it("rejects unsupported syntax", () => {
    expect(() => validateStatisticExpression("points; process.exit()")).toThrow("expression contains unsupported syntax");
  });

  it("rejects overly long expressions", () => {
    expect(() => validateStatisticExpression("points".repeat(40))).toThrow("expression contains unsupported syntax");
  });
});
