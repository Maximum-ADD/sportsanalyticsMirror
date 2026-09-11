import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CALIBRATION, MODEL_ACCURACY, THIN_BUCKET_GAMES } from "./placeholderData";

const PERCENT_1DP = (value: number) => `${(value * 100).toFixed(1)}%`;

// A local tile rather than the shared StatTile: that component hard-codes
// text-text-muted / text-text-primary with no className escape hatch, and
// both are off-white values built for the dark app shell — unreadable on
// this page's light ground. Worth giving StatTile a variant later; not
// worth blocking /home on it.
//
// (Separately, StatTile's label style measures 4.02:1 on surface-card,
// which fails WCAG AA in the ~38 places it is currently used. Moving it to
// text-text-secondary is a one-line fix that lifts contrast app-wide.)
function LedgerFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-landing-light bg-landing-hero px-4 py-3">
      <div className="text-[10.5px] font-medium tracking-[0.1em] text-locker-ink-muted uppercase">{label}</div>
      <div className="mt-1 font-display text-[27px] text-landing-ink tabular-nums">{value}</div>
    </div>
  );
}

// Deliberately public and identical for every account — that is what makes
// "published" mean anything, and it is the benchmark a personal record gets
// measured against, so it belongs on the same page.
//
// A real <table> rather than a chart, on purpose: accessible by
// construction, and correct at any width.
export function ModelAccuracyLedger() {
  return (
    <Card className="rounded-none border-landing-light bg-locker-surface p-6">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Model accuracy ledger
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LedgerFigure label="Accuracy" value={PERCENT_1DP(MODEL_ACCURACY.accuracy)} />
        <LedgerFigure label="Brier score" value={MODEL_ACCURACY.brierScore.toFixed(3)} />
        {/* Without the baseline, "61.3%" is a number with no meaning. */}
        <LedgerFigure label="Baseline · always home" value={PERCENT_1DP(MODEL_ACCURACY.homeBaseline)} />
      </div>

      {/* Table brings its own overflow-x-auto wrapper, so the page body never
          scrolls sideways on a narrow screen. The primitives are styled for
          the dark app shell, so each one takes a light override here. */}
      <div className="mt-3.5">
        <Table>
          <caption className="sr-only">
            Model calibration by predicted probability band, {MODEL_ACCURACY.season} season
          </caption>
          <TableHeader className="bg-landing-hero text-locker-ink-muted">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-mono text-[9.5px] tracking-[0.14em] uppercase">
                Predicted band
              </TableHead>
              <TableHead className="font-mono text-[9.5px] tracking-[0.14em] uppercase">Model said</TableHead>
              <TableHead className="font-mono text-[9.5px] tracking-[0.14em] uppercase">
                Actually won
              </TableHead>
              <TableHead className="font-mono text-[9.5px] tracking-[0.14em] uppercase">Games</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-landing-light">
            {CALIBRATION.map((bucket) => {
              // A thin bucket is reported, not hidden, and not dressed up as
              // fact — the top band holds single digits on a 284-game sample.
              const thin = bucket.games < THIN_BUCKET_GAMES;
              return (
                <TableRow key={bucket.band} className="hover:bg-landing-hero/60">
                  <TableCell className={thin ? "text-locker-ink-muted" : "text-landing-ink"}>
                    {bucket.band}
                  </TableCell>
                  <TableCell
                    className={thin ? "text-locker-ink-muted tabular-nums" : "text-locker-model tabular-nums"}
                  >
                    {PERCENT_1DP(bucket.modelSaid)}
                  </TableCell>
                  <TableCell className={thin ? "text-locker-ink-muted tabular-nums" : "text-landing-ink tabular-nums"}>
                    {PERCENT_1DP(bucket.actuallyWon)}
                  </TableCell>
                  <TableCell className="text-locker-ink-muted tabular-nums">
                    {bucket.games}
                    {thin && " · n too small"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 max-w-[72ch] text-[11.5px] text-locker-ink-muted">
        Backtested on {MODEL_ACCURACY.gamesBacktested} completed {MODEL_ACCURACY.season} games.{" "}
        <code className="font-mono text-[11px]">predict_games.py</code> uses each team&rsquo;s pre-game Elo and
        Four Factors state only — no outcome leakage.{" "}
        <b className="font-semibold text-landing-ink">
          {MODEL_ACCURACY.forwardPredictions} forward predictions so far.
        </b>
      </p>
    </Card>
  );
}
