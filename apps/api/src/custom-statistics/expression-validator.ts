const ALLOWED_IDENTIFIERS = new Set(["points", "rebounds", "assists", "steals", "blocks", "turnovers", "minutes"]);
const SAFE_EXPRESSION = /^[\d\s+\-*/().A-Za-z_]+$/;

export function validateStatisticExpression(expression: string): void {
  if (!SAFE_EXPRESSION.test(expression) || expression.length > 200) throw new Error("expression contains unsupported syntax");
  for (const identifier of expression.match(/[A-Za-z_]+/g) ?? []) {
    if (!ALLOWED_IDENTIFIERS.has(identifier)) throw new Error(`unsupported statistic: ${identifier}`);
  }
}
