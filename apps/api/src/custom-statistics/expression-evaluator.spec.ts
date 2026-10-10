import { describe, expect, it } from "vitest";
import { evaluateStatisticExpression } from "./expression-evaluator.js";

describe("evaluateStatisticExpression", () => {
  const statisticValues = new Map([
    ["points", 24],
    ["rebounds", 8],
    ["assists", 6],
  ]);

  it("calculates arithmetic over approved statistic values", () => {
    expect(evaluateStatisticExpression("points + rebounds * 2", statisticValues)).toBe(40);
  });

  it("supports parentheses and unary negative values", () => {
    expect(evaluateStatisticExpression("(points - assists) / -rebounds", statisticValues)).toBeCloseTo(-2.25);
  });

  it("rejects unknown identifiers and unsupported syntax", () => {
    expect(() => evaluateStatisticExpression("points + salary", statisticValues)).toThrow("unsupported statistic: salary");
    expect(() => evaluateStatisticExpression("points; process.exit()", statisticValues)).toThrow("expression contains unsupported syntax");
  });

  it("rejects division by zero", () => {
    expect(() => evaluateStatisticExpression("points / 0", statisticValues)).toThrow("expression cannot divide by zero");
  });
});
