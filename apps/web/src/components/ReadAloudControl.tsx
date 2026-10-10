import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Square, Volume2 } from "lucide-react";
import { chunkForSpeech, extractReadableText } from "@/lib/readAloud";

// Read-aloud is a progressive enhancement: every target browser ships speech
// synthesis, but jsdom (and any locked-down webview with audio disabled)
// does not, so the control simply doesn't exist where it couldn't work.
function speechIsAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

/**
 * Floating text-to-speech control for the current page: reads #main-content
 * aloud through the browser's speech engine, one extracted prose block at a
 * time, until it finishes or the user stops it.
 */
export function ReadAloudControl() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Cancel is owned by the in-flight read (each start replaces it), so a
  // stop click, a route change, and unmount all funnel through one ref.
  const cancelRef = useRef<() => void>(() => {});
  const { pathname } = useLocation();

  const stop = useCallback(() => {
    cancelRef.current();
    setIsSpeaking(false);
  }, []);

  // Narrating across a client-side navigation would keep reading the page
  // the user just left. Runs on mount too, when stopping is a no-op.
  useEffect(() => {
    stop();
  }, [pathname, stop]);

  // Never leave an utterance queued after the control unmounts.
  useEffect(() => () => cancelRef.current(), []);

  if (!speechIsAvailable()) return null;

  function startReading() {
    const root = document.getElementById("main-content");
    if (!root) return;
    const blocks = extractReadableText(root);
    if (blocks.length === 0) return;
    // Flatten to engine-sized chunks up front so the read loop below is a
    // plain "speak the next chunk on end" cycle with no measuring mid-read.
    const chunks = blocks.flatMap((block) => chunkForSpeech(block));

    // Capture the synth this read started with: unmounting the control runs
    // the cancel closure after test globals (or a page's own cleanup) may
    // have moved on, and the utterances already queued belong to this
    // instance anyway.
    const synth = window.speechSynthesis;
    let cancelled = false;
    let nextChunkIndex = 0;
    cancelRef.current = () => {
      cancelled = true;
      synth.cancel();
    };
    setIsSpeaking(true);

    const speakNextChunk = () => {
      if (cancelled) return;
      if (nextChunkIndex >= chunks.length) {
        setIsSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[nextChunkIndex]);
      nextChunkIndex += 1;
      utterance.lang = document.documentElement.lang || "en";
      utterance.onend = speakNextChunk;
      utterance.onerror = (event) => {
        // Stopping cancels the in-flight utterance, which surfaces as an
        // error — that is the stop signal working, not a reason to abort;
        // engine hiccups on one chunk skip ahead rather than ending the read.
        if (event.error !== "canceled" && event.error !== "interrupted") speakNextChunk();
      };
      synth.speak(utterance);
    };
    speakNextChunk();
  }

  return (
    // z-40: above page content (z-20) and the header drawer (z-30), below
    // the optimizer's modal overlay (z-50) which must keep the top layer
    // while it is open.
    <button
      type="button"
      onClick={() => (isSpeaking ? stop() : startReading())}
      aria-pressed={isSpeaking}
      aria-label={isSpeaking ? "Stop reading the page aloud" : "Read the page aloud"}
      className="fixed right-4 bottom-4 z-40 inline-flex h-11 items-center gap-2 border border-landing-light bg-locker-surface px-4 text-[13px] text-landing-ink shadow-[0_10px_24px_rgba(0,0,0,0.25)] transition-colors hover:border-locker-leather hover:text-locker-leather focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
    >
      {isSpeaking ? <Square className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
      {/* Visible text is aria-hidden because the button's accessible name
          already carries the fuller wording — this span is for sighted
          users only. */}
      <span aria-hidden>{isSpeaking ? "Stop reading" : "Read aloud"}</span>
    </button>
  );
}
