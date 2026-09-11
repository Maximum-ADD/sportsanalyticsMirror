import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/ErrorState";
import { Card } from "@/components/ui/card";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchModelAccuracy } from "@/lib/nbaApi";
import { NO_VALUE } from "@/lib/playerBio";

// A band holding fewer games than this is reported, but greyed and labelled:
// 21 games cannot settle a "90%" claim, and presenting it as fact invites a
// question nobody wants to be asked. Named rather than inlined so the
// threshold is arguable in one place.
const MINIMUM_GAMES_FOR_A_READABLE_BAND = 25;

/**
 * Formats a 0..1 rate as a one-decimal percentage.
 *
 * @param rate - the value to format, or null when there was nothing to measure.
 * @returns the percentage, or an em-dash when the API reported null.
 *
 * Null is a real state here rather than an absence of data to paper over: on
 * an empty database "0.0%" would claim the model got everything wrong, which
 * is a different and much worse statement than "nothing to score yet".
 */
function formatRateAsPercent(rate: number | null): string {
  return rate === null ? NO_VALUE : `${(rate * 100).toFixed(1)}%`;
}

/**
 * Formats the Brier score, which is already an absolute value rather than a rate.
 *
 * @param score - mean squared error of the win probabilities, or null.
 * @returns the score to three decimals, or an em-dash.
 */
function formatBrierScore(score: number | null): string {
  return score === null ? NO_VALUE : score.toFixed(3);
}

// A local tile rather than the shared StatTile: that component hard-codes
// text-text-muted / text-text-primary with no className escape hatch, and
// both are off-white values built for the dark app shell — unreadable on
// this page's light ground.
function LedgerFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-landing-light bg-landing-hero px-4 py-3">
      <div className="text-[10.5px] font-medium tracking-[0.1em] text-locker-ink-muted uppercase">{label}</div>
      <div className="mt-1 font-display text-[27px] text-landing-ink tabular-nums">{value}</div>
    </div>
  );
}

function LedgerShell({ children }: { children: React.ReactNode }) {
  return (
    <Card className="rounded-none border-landing-light bg-locker-surface p-6">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Model accuracy ledger
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>
      {children}
    </Card>
  );
}

// Deliberately public and identical for every account — that is what makes
// "published" mean anything, and it is the benchmark a personal record gets
// measured against, so it belongs on the same page.
//
// A real <table> rather than a chart, on purpose: accessible by construction,
// and correct at any width.
//
// This is the one home-page module that needs no session, so it is wired to
// the live API while the personalised modules still wait on sign-in.
export function ModelAccuracyLedger() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["modelAccuracy"],
    queryFn: fetchModelAccuracy,
  });

  if (isPending) {
    return (
      <LedgerShell>
        <div className="flex min-h-40 items-center justify-center">
          <BasketballSpinner label="Loading model accuracy" />
        </div>
      </LedgerShell>
    );
  }

  if (isError) {
    return (
      <LedgerShell>
        <ErrorState message="Could not load the model's accuracy." onRetry={() => refetch()} />
      </LedgerShell>
    );
  }

  return (
    <LedgerShell>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LedgerFigure label="Accuracy" value={formatRateAsPercent(data.accuracy)} />
        <LedgerFigure label="Brier score" value={formatBrierScore(data.brierScore)} />
        {/* Without the baseline, the accuracy figure has no scale to be read
            against — a model that matches "always pick the home team" has
            demonstrated nothing, and only this tile makes that visible. */}
        <LedgerFigure label="Baseline · always home" value={formatRateAsPercent(data.homeBaselineAccuracy)} />
      </div>

      {/* Table brings its own overflow-x-auto wrapper, so the page body never
          scrolls sideways. Its primitives are styled for the dark app shell,
          so each one takes a light override here. */}
      <div className="mt-3.5">
        <Table>
          <caption className="sr-only">Model calibration by predicted probability band</caption>
          <TableHeader className="bg-landing-hero text-locker-ink-muted">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-mono text-[9.5px] tracking-[0.14em] uppercase">Predicted band</TableHead>
              <TableHead className="font-mono text-[9.5px] tracking-[0.14em] uppercase">Model said</TableHead>
              <TableHead className="font-mono text-[9.5px] tracking-[0.14em] uppercase">Actually won</TableHead>
              <TableHead className="font-mono text-[9.5px] tracking-[0.14em] uppercase">Games</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-landing-light">
            {data.calibration.map((band) => {
              const isThin = band.gamesInBand < MINIMUM_GAMES_FOR_A_READABLE_BAND;
              return (
                <TableRow key={band.band} className="hover:bg-landing-hero/60">
                  <TableCell className={isThin ? "text-locker-ink-muted" : "text-landing-ink"}>
                    {band.band}%
                  </TableCell>
                  <TableCell
                    className={isThin ? "text-locker-ink-muted tabular-nums" : "text-locker-model tabular-nums"}
                  >
                    {formatRateAsPercent(band.meanPredicted)}
                  </TableCell>
                  <TableCell className={isThin ? "text-locker-ink-muted tabular-nums" : "text-landing-ink tabular-nums"}>
                    {formatRateAsPercent(band.actualWinRate)}
                  </TableCell>
                  <TableCell className="text-locker-ink-muted tabular-nums">
                    {band.gamesInBand}
                    {isThin && band.gamesInBand > 0 && " · n too small"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 max-w-[72ch] text-[11.5px] text-locker-ink-muted">
        Scored over {data.gamesEvaluated} completed{" "}
        {data.gamesEvaluated === 1 ? "game that has" : "games that have"} a stored prediction.{" "}
        <code className="font-mono text-[11px]">predict_games.py</code> uses each team&rsquo;s pre-game Elo and Four
        Factors state only — no outcome leakage.{" "}
        <b className="font-semibold text-landing-ink">
          {data.forwardPredictionCount} forward{" "}
          {data.forwardPredictionCount === 1 ? "prediction" : "predictions"} so far.
        </b>
      </p>
    </LedgerShell>
  );
}
