import { Check, X } from "lucide-react";

interface HitMissPillProps {
  hit: boolean;
}

// Glyph AND word, never color alone — the same red/green CVD rule the
// homepage's BeatTheModelCard already follows for its correct/missed pill.
// Shared between PredictionsPage's cards and HomePage's Recent Results —
// pulled out once a second surface needed the identical pill rather than a
// second copy of the same four lines.
export function HitMissPill({ hit }: HitMissPillProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 px-2 py-0.5 font-mono text-[9px] tracking-[0.12em] text-white uppercase ${
        hit ? "bg-locker-good" : "bg-locker-bad"
      }`}
    >
      {hit ? <Check aria-hidden className="size-3" /> : <X aria-hidden className="size-3" />}
      {hit ? "Model hit" : "Model miss"}
    </span>
  );
}
