import axe, { type Result } from "axe-core";
import { expect } from "vitest";

function formatViolation(violation: Result): string {
  const targets = violation.nodes.flatMap((node) => node.target).join(", ");
  return `${violation.id}: ${violation.help} (${targets})`;
}

/**
 * Runs axe against rendered page content and fails with concise, actionable
 * rule and selector details when accessibility violations are found.
 */
export async function expectNoAccessibilityViolations(container: HTMLElement): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      // jsdom has no layout or canvas text metrics, so axe cannot evaluate
      // contrast here. Keep contrast in the manual browser audit rather than
      // emitting a false test signal from an unsupported environment.
      "color-contrast": { enabled: false },
    },
  });
  const message = results.violations.map(formatViolation).join("\n");

  expect(results.violations, message).toHaveLength(0);
}
