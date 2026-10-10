const TOKEN_PATTERN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_]+)|([()+\-*/]))/y;

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string };

class ExpressionParser {
  private tokenIndex = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly statisticValues: ReadonlyMap<string, number>
  ) {}

  parse(): number {
    const value = this.parseSum();
    if (this.currentToken()) throw new Error("expression contains unsupported syntax");
    return value;
  }

  private parseSum(): number {
    let value = this.parseProduct();
    while (this.isCurrentOperator(["+", "-"])) {
      const operator = this.consumeOperator();
      const rightValue = this.parseProduct();
      value = operator === "+" ? value + rightValue : value - rightValue;
    }
    return value;
  }

  private parseProduct(): number {
    let value = this.parseFactor();
    while (this.isCurrentOperator(["*", "/"])) {
      const operator = this.consumeOperator();
      const rightValue = this.parseFactor();
      if (operator === "/" && rightValue === 0) throw new Error("expression cannot divide by zero");
      value = operator === "*" ? value * rightValue : value / rightValue;
    }
    return value;
  }

  private parseFactor(): number {
    const token = this.consumeToken();
    if (token.type === "number") return token.value;
    if (token.type === "identifier") {
      const value = this.statisticValues.get(token.value);
      if (value === undefined) throw new Error(`unsupported statistic: ${token.value}`);
      return value;
    }
    if (token.value === "-") return -this.parseFactor();
    if (token.value === "(") {
      const value = this.parseSum();
      const closingToken = this.consumeToken();
      if (closingToken.type !== "operator" || closingToken.value !== ")") throw new Error("expression contains unsupported syntax");
      return value;
    }
    throw new Error("expression contains unsupported syntax");
  }

  private currentToken(): Token | undefined {
    return this.tokens[this.tokenIndex];
  }

  private consumeToken(): Token {
    const token = this.currentToken();
    if (!token) throw new Error("expression contains unsupported syntax");
    this.tokenIndex += 1;
    return token;
  }

  private consumeOperator(): string {
    const token = this.consumeToken();
    if (token.type !== "operator") throw new Error("expression contains unsupported syntax");
    return token.value;
  }

  private isCurrentOperator(operators: string[]): boolean {
    const token = this.currentToken();
    return token?.type === "operator" && operators.includes(token.value);
  }
}

function tokenizeExpression(expression: string): Token[] {
  const tokens: Token[] = [];
  let characterIndex = 0;
  while (characterIndex < expression.length) {
    TOKEN_PATTERN.lastIndex = characterIndex;
    const match = TOKEN_PATTERN.exec(expression);
    if (!match) throw new Error("expression contains unsupported syntax");
    characterIndex = TOKEN_PATTERN.lastIndex;
    if (match[1]) tokens.push({ type: "number", value: Number(match[1]) });
    else if (match[2]) tokens.push({ type: "identifier", value: match[2] });
    else if (match[3]) tokens.push({ type: "operator", value: match[3] });
  }
  return tokens;
}

/** Safely calculates arithmetic over known per-game statistic averages. */
export function evaluateStatisticExpression(expression: string, statisticValues: ReadonlyMap<string, number>): number {
  return new ExpressionParser(tokenizeExpression(expression), statisticValues).parse();
}
