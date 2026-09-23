import { describe, expect, it } from "vitest";
import { chunkForSpeech, extractReadableText } from "./readAloud";

function rootWith(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("extractReadableText", () => {
  it("collects block-level prose in document order", () => {
    const root = rootWith(`
      <div>
        <h1>Player comparison</h1>
        <p>Compare up to 4 players.</p>
        <ul><li>First</li><li>Second</li></ul>
      </div>
    `);

    expect(extractReadableText(root)).toEqual(["Player comparison", "Compare up to 4 players.", "First", "Second"]);
  });

  it("skips aria-hidden content, SVG shapes, and script/style blocks", () => {
    const root = rootWith(`
      <div>
        <p>Visible.</p>
        <p aria-hidden="true">Hidden label.</p>
        <div aria-hidden="true"><p>Also hidden.</p></div>
        <svg viewBox="0 0 10 10"><text>Chart ink</text></svg>
        <script>var x = 1;</script>
        <style>.a { color: red; }</style>
      </div>
    `);

    expect(extractReadableText(root)).toEqual(["Visible."]);
  });

  it("reads an icon-only control by its aria-label rather than its (empty) text", () => {
    const root = rootWith(`<div><button aria-label="Open menu"><svg></svg></button></div>`);

    expect(extractReadableText(root)).toEqual(["Open menu"]);
  });

  it("reads nested markup once, from the outermost text block", () => {
    const root = rootWith(`<div><p>Read <a href="#">the docs</a> now.</p></div>`);

    expect(extractReadableText(root)).toEqual(["Read the docs now."]);
  });

  it("announces table cells with their row and column headers", () => {
    const root = rootWith(`
      <table>
        <thead><tr><th>Player</th><th>Points</th></tr></thead>
        <tbody><tr><th>LeBron James</th><td>30</td></tr></tbody>
      </table>
    `);

    expect(extractReadableText(root)).toEqual(["Player", "Points", "LeBron James", "LeBron James, Points: 30"]);
  });

  it("includes screen-reader-only summaries such as chart data", () => {
    const root = rootWith(`
      <div>
        <p>Trait radar</p>
        <ul class="sr-only"><li>Scoring 77 out of 100</li></ul>
      </div>
    `);

    expect(extractReadableText(root)).toContain("Scoring 77 out of 100");
  });
});

describe("chunkForSpeech", () => {
  it("groups sentences that fit inside the chunk cap", () => {
    expect(chunkForSpeech("One. Two. Three.")).toEqual(["One. Two. Three."]);
  });

  it("starts a new chunk when the next sentence would exceed the cap", () => {
    const sentenceA = `${"A".repeat(120)}.`;
    const sentenceB = `${"B".repeat(120)}.`;

    expect(chunkForSpeech(`${sentenceA} ${sentenceB}`, 200)).toEqual([sentenceA, sentenceB]);
  });

  it("hard-splits a single over-long sentence at word boundaries", () => {
    const words = "word ".repeat(60).trim(); // ~295 characters, no sentence end.
    const chunks = chunkForSpeech(words, 100);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
    expect(chunks.join(" ")).toBe(words);
  });

  it("splits a single over-long word mid-word when no space exists", () => {
    const longWord = "x".repeat(250);
    expect(chunkForSpeech(longWord, 200)).toEqual(["x".repeat(200), "x".repeat(50)]);
  });

  it("returns nothing for empty prose", () => {
    expect(chunkForSpeech("")).toEqual([]);
    expect(chunkForSpeech("   ")).toEqual([]);
  });
});
