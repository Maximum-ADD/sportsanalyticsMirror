import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.js";

interface Row {
  name: string;
  points: number | null;
}

describe("toCsv", () => {
  it("renders a header row followed by one data row per input, CRLF-terminated", () => {
    const csv = toCsv<Row>(
      [
        { name: "Curry", points: 30 },
        { name: "James", points: 25 },
      ],
      [
        { header: "Name", value: (row) => row.name },
        { header: "Points", value: (row) => row.points },
      ]
    );

    expect(csv).toBe("Name,Points\r\nCurry,30\r\nJames,25\r\n");
  });

  it("renders null/undefined as an empty cell, not the literal string 'null'", () => {
    const csv = toCsv<Row>([{ name: "Curry", points: null }], [
      { header: "Name", value: (row) => row.name },
      { header: "Points", value: (row) => row.points },
    ]);

    expect(csv).toBe("Name,Points\r\nCurry,\r\n");
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv([{ text: "Los Angeles, CA" }], [{ header: "Text", value: (row) => row.text }]);

    expect(csv).toBe('Text\r\n"Los Angeles, CA"\r\n');
  });

  it("quotes a field containing a double quote, doubling the internal quote", () => {
    const csv = toCsv([{ text: 'He said "hi"' }], [{ header: "Text", value: (row) => row.text }]);

    expect(csv).toBe('Text\r\n"He said ""hi"""\r\n');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv([{ text: "line one\nline two" }], [{ header: "Text", value: (row) => row.text }]);

    expect(csv).toBe('Text\r\n"line one\nline two"\r\n');
  });

  it("does not quote a plain field with no special characters", () => {
    const csv = toCsv([{ text: "Lakers" }], [{ header: "Text", value: (row) => row.text }]);

    expect(csv).toBe("Text\r\nLakers\r\n");
  });

  it("renders just the header line, CRLF-terminated, for an empty row set", () => {
    const csv = toCsv<Row>([], [{ header: "Name", value: (row) => row.name }]);

    expect(csv).toBe("Name\r\n");
  });
});
