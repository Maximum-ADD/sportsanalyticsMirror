import { Check, X } from "lucide-react";

interface HitMissPillProps {
  hit: boolean;
  // The predictions surfaces say "Model hit"/"Model miss"; the optimizer's
  // solver checks reuse the same pill with their own words.
  hitLabel?: string;
  missLabel?: string;
}

// Glyph AND word, never color alone — the same red/green CVD rule the
// homepage's BeatTheModelCard already follows for its correct/missed pill.
// Shared between PredictionsPage's cards and HomePage's Recent Results —
// pulled out once a second surface needed the identical pill rather than a
// second copy of the same four lines.
export function HitMissPill({ hit, hitLabel = "Model hit", missLabel = "Model miss" }: HitMissPillProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 px-2 py-0.5 font-mono text-[9px] tracking-[0.12em] text-white uppercase ${
        hit ? "bg-locker-good" : "bg-locker-bad"
      }`}
    >
      {hit ? <Check aria-hidden className="size-3" /> : <X aria-hidden className="size-3" />}
      {hit ? hitLabel : missLabel}
    </span>
  );
}
