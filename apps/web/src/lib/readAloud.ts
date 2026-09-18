// Text preparation for the read-aloud (text-to-speech) control: what to read
// from the page, and how to slice it for the speech engine.
//
// Kept free of React and DOM-global side effects (everything takes an
// element in and returns data out) so the whole pipeline is unit-testable in
// jsdom, which implements neither speech synthesis nor layout.

// Elements whose own text is a complete speakable unit. Anything not listed
// (divs, spans, sections, …) only contributes text through these children,
// which is what stops the same sentence being collected twice from nested
// markup.
const TEXT_BLOCK_TAGS = new Set([
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "P",
  "LI",
  "DT",
  "DD",
  "BLOCKQUOTE",
  "FIGCAPTION",
  "CAPTION",
  "SUMMARY",
  "OPTION",
  "BUTTON",
  "A",
  "LABEL",
]);

// Whole subtrees that carry no page prose — chrome, decoration, and the
// charts' SVG shapes (their data is exposed to non-sighted users through the
// components' own screen-reader summaries instead).
const SKIPPED_SUBTREE_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "CANVAS",
  "IFRAME",
  "TEMPLATE",
  "SELECT",
  "DATALIST",
]);

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

// aria-hidden chrome (icons, duplicate labels) must not be spoken. The walk
// starts at the element itself, so an aria-hidden element excludes its own
// text as well as its descendants'.
function isInSkippedSubtree(element: HTMLElement, root: HTMLElement): boolean {
  let node: HTMLElement | null = element;
  while (node && node !== root) {
    if (SKIPPED_SUBTREE_TAGS.has(node.tagName) || node.getAttribute("aria-hidden") === "true") return true;
    node = node.parentElement;
  }
  return false;
}

// A bare cell value ("30") is meaningless without its headers. Read table
// cells as "row header, column header: value" so the figures land with their
// meaning; header cells read as-is.
function describeTableCell(cell: HTMLTableCellElement): string {
  const value = normalizedText(cell.textContent);
  if (!value) return "";
  if (cell.tagName === "TH") return value;
  const rowHeader = normalizedText(cell.closest("tr")?.querySelector("th")?.textContent);
  const table = cell.closest("table");
  const columnHeader = table ? normalizedText(table.querySelectorAll("thead th").item(cell.cellIndex)?.textContent) : "";
  if (rowHeader && columnHeader && rowHeader !== columnHeader) {
    return `${rowHeader}, ${columnHeader}: ${value}`;
  }
  if (rowHeader) return `${rowHeader}: ${value}`;
  return value;
}

/**
 * Collects the page's prose in reading order for text-to-speech. Block-level
 * text units become one entry each; hidden/decorative subtrees are skipped.
 * Screen-reader-only text (chart data summaries) is deliberately included —
 * it exists precisely to carry this information non-visually, and the
 * read-aloud control is one of its consumers.
 */
export function extractReadableText(root: HTMLElement): string[] {
  const blocks: string[] = [];
  for (const element of Array.from(root.querySelectorAll("*"))) {
    const isCell = element instanceof HTMLTableCellElement;
    if (!isCell && !(element instanceof HTMLElement)) continue;
    if (!isCell && !TEXT_BLOCK_TAGS.has((element as HTMLElement).tagName)) continue;

    const htmlElement = element as HTMLElement;
    // Only the outermost text unit in a nested chain (a link inside a
    // paragraph, a list inside a list item) produces a block — otherwise the
    // inner text would be collected once with its parent and again alone.
    let ancestor = htmlElement.parentElement;
    let nestedInTextBlock = false;
    while (ancestor && ancestor !== root) {
      if (TEXT_BLOCK_TAGS.has(ancestor.tagName) || ancestor instanceof HTMLTableCellElement) {
        nestedInTextBlock = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (nestedInTextBlock || isInSkippedSubtree(htmlElement, root)) continue;

    const text = isCell
      ? describeTableCell(element as HTMLTableCellElement)
      : // An explicit label wins over rendered text for icon-only controls;
        // visible text wins everywhere else.
        normalizedText(htmlElement.getAttribute("aria-label")) || normalizedText(htmlElement.textContent);
    if (text) blocks.push(text);
  }
  return blocks;
}

const DEFAULT_MAX_CHUNK_LENGTH = 200;

// Splits prose into speakable chunks no longer than the engine reliably
// handles. Chrome's speechSynthesis stalls on long utterances (a known
// ~15-second bug), so sentences are grouped up to the cap, and a single
// sentence longer than the cap is hard-split at word boundaries.
export function chunkForSpeech(text: string, maxChunkLength: number = DEFAULT_MAX_CHUNK_LENGTH): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["'”’)\]]*\s*|[^.!?]+$/g) ?? [];
  const chunks: string[] = [];
  let current = "";

  function flushCurrent() {
    if (current) {
      chunks.push(current);
      current = "";
    }
  }

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (current && current.length + trimmed.length + 1 > maxChunkLength) flushCurrent();
    if (trimmed.length > maxChunkLength) {
      flushCurrent();
      let remainder = trimmed;
      while (remainder.length > maxChunkLength) {
        const window = remainder.slice(0, maxChunkLength);
        const splitAt = window.lastIndexOf(" ");
        chunks.push(remainder.slice(0, splitAt > 0 ? splitAt : maxChunkLength));
        remainder = remainder.slice(splitAt > 0 ? splitAt + 1 : maxChunkLength);
      }
      current = remainder;
    } else {
      current = current ? `${current} ${trimmed}` : trimmed;
    }
  }
  flushCurrent();
  return chunks;
}
