import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiUsageBreakdown } from "./ApiUsageBreakdown";

// jsdom never gives ResponsiveContainer a size, so the recharts internals
// never mount — the chart's accessible summary renders regardless, and the
// endpoint list is plain HTML, not SVG, so it's checked directly.
describe("ApiUsageBreakdown", () => {
  it("renders nothing when the user has no logged requests at all", () => {
    const { container } = render(<ApiUsageBreakdown byEndpoint={[]} byDay={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("describes the daily chart with a total and date range", () => {
    render(
      <ApiUsageBreakdown
        byEndpoint={[{ endpoint: "GET /v1/players", count: 10 }]}
        byDay={[
          { date: "2026-10-01", count: 4 },
          { date: "2026-10-02", count: 6 },
        ]}
      />
    );

    expect(
      screen.getByRole("img", { name: "10 requests over the last 14 days, from Oct 1 to Oct 2" })
    ).toBeInTheDocument();
  });

  it("lists every endpoint with its count, most called first", () => {
    render(
      <ApiUsageBreakdown
        byEndpoint={[
          { endpoint: "GET /v1/players", count: 30 },
          { endpoint: "GET /v1/games", count: 12 },
        ]}
        byDay={[]}
      />
    );

    const items = screen.getAllByText(/GET \/v1\//);
    expect(items.map((item) => item.textContent)).toEqual(["GET /v1/players", "GET /v1/games"]);
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("falls back to a plain message when there are no requests in the window", () => {
    render(<ApiUsageBreakdown byEndpoint={[{ endpoint: "GET /v1/players", count: 5 }]} byDay={[]} />);

    expect(screen.getByText("No requests in the last 14 days")).toBeInTheDocument();
  });
});
