import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PageTutorialDefinition, TutorialCloseReason } from "@/lib/pageTutorial";
import { cn } from "@/lib/utils";
import { TutorialPageMap } from "./TutorialPageMap";

// "Blurred 30%": a 30% ink wash and a light blur across the whole page. CSS
// blur takes a radius, not a percentage, so the 30% is carried by the wash and
// the blur is kept small — the page stays recognisably itself behind the
// tutorial, which matters because the map in front of it is a picture of it.
const BACKDROP_CLASSES = "bg-landing-ink/30 backdrop-blur-sm";

const FOOTER_BUTTON_CLASSES =
  "inline-flex min-h-11 items-center justify-center gap-1.5 border px-3.5 font-mono text-[10.5px] tracking-[0.14em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather disabled:cursor-not-allowed disabled:opacity-40";
const SECONDARY_BUTTON_CLASSES = `${FOOTER_BUTTON_CLASSES} border-landing-light bg-locker-surface text-locker-ink-muted hover:text-landing-ink`;
// White on the leather hover fill, as everywhere else text sits on leather:
// the resting landing-hero label measures only 3.8:1 against it, under AA for
// type this small.
const PRIMARY_BUTTON_CLASSES = `${FOOTER_BUTTON_CLASSES} border-landing-ink bg-landing-ink text-landing-hero hover:border-locker-leather hover:bg-locker-leather hover:text-white`;
const QUIET_BUTTON_CLASSES = `${FOOTER_BUTTON_CLASSES} border-transparent px-2.5 text-locker-ink-muted underline-offset-4 hover:text-landing-ink hover:underline`;

interface PageTutorialDialogProps {
  tutorial: PageTutorialDefinition;
  /** Called once, with how the user left. Every reason marks the tutorial seen (see usePageTutorial). */
  onClose: (reason: TutorialCloseReason) => void;
}

/**
 * The page tutorial itself: a modal walkthrough over the blurred page, one
 * step per section, each with a map of the page that highlights and points
 * at the section being described.
 *
 * Ways out, all of which count as having seen it: Complete (the last step's
 * Next), Skip (this page's tutorial), Skip all (every page's — see
 * User.autoOpenTutorials) and Exit (the ✕, or Escape). Clicking the blurred
 * page does nothing: an accidental click out of a one-time tutorial would
 * spend it, so leaving is always a deliberate button press.
 *
 * Keyboard: Tab stays inside the dialog, the left and right arrow keys step
 * back and forward, and focus returns to wherever it was (the "?" button, on a
 * replay) once the dialog closes. Rendered only while open, so every opening
 * starts again from the first step.
 */
export function PageTutorialDialog({ tutorial, onClose }: PageTutorialDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const stepScrollerRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const dialogLabelId = useId();
  const stepTitleId = useId();

  const step = tutorial.steps[stepIndex];
  const stepCount = tutorial.steps.length;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === stepCount - 1;

  // Focus lands on Next, so the whole walkthrough can be read with Enter
  // alone. On close, focus goes back to whatever had it before — the "?"
  // button on a replay, or nothing in particular when the page opened it.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    primaryButtonRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, []);

  // The step scroller is the same element on every step, so it would keep the
  // last step's offset — on a short screen, opening the next step with its
  // highlighted section already scrolled out of view. Every step starts at
  // the top, map first. (scrollTop rather than scrollTo(), which jsdom lacks.)
  useEffect(() => {
    if (stepScrollerRef.current) stepScrollerRef.current.scrollTop = 0;
  }, [stepIndex]);

  function goToNextStep() {
    setStepIndex((index) => Math.min(index + 1, stepCount - 1));
  }

  function goToPreviousStep() {
    // Previous disables itself on the first step, and a disabled button drops
    // focus to the page behind — so it moves to Next before that can happen.
    if (stepIndex === 1) primaryButtonRef.current?.focus();
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  function advanceOrComplete() {
    if (isLastStep) {
      onClose("complete");
      return;
    }
    goToNextStep();
  }

  // Tab cycles inside the dialog so keyboard users can't fall through to the
  // page behind the backdrop — SaveLineupDialog's rule, plus one case it
  // doesn't have: Shift+Tab from the panel itself, which a click on the
  // header's or footer's own text focuses, and which sits before every button
  // in the tab order.
  function keepTabInsideDialog(event: KeyboardEvent<HTMLDivElement>) {
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)");
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      onClose("exit");
    } else if (event.key === "ArrowRight") {
      goToNextStep();
    } else if (event.key === "ArrowLeft" && !isFirstStep) {
      goToPreviousStep();
    } else if (event.key === "Tab") {
      keepTabInsideDialog(event);
    }
  }

  return (
    // z-50, the modal layer: above page content (z-20), the header (z-30) and
    // the floating controls (z-40), the "?" button that opened it included.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" onKeyDown={handleKeyDown}>
      {/* preventDefault on mousedown keeps focus inside the dialog when the
          backdrop is clicked: it is not focusable, so a click on it would
          otherwise move focus to <body> — out of reach of Escape and the Tab
          loop above. */}
      <div
        aria-hidden
        onMouseDown={(event) => event.preventDefault()}
        className={cn("animate-tutorial-fade-in absolute inset-0 motion-reduce:animate-none", BACKDROP_CLASSES)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogLabelId}
        aria-describedby={stepTitleId}
        // -1 so a click on the panel's own text keeps focus inside the dialog.
        tabIndex={-1}
        className="animate-tutorial-fade-in relative flex max-h-full w-full max-w-5xl flex-col border border-landing-light bg-locker-surface shadow-[0_24px_60px_rgba(0,0,0,0.35)] focus:outline-none motion-reduce:animate-none"
      >
        <div className="flex items-center gap-3 border-b border-landing-light px-4 py-2 sm:px-5">
          <p id={dialogLabelId} className="font-mono text-[10px] tracking-[0.2em] text-locker-leather uppercase">
            Page tutorial · {tutorial.pageName}
          </p>
          <p className="ml-auto font-mono text-[10px] tracking-[0.14em] whitespace-nowrap text-locker-ink-muted uppercase">
            Step {stepIndex + 1} of {stepCount}
          </p>
          <button
            type="button"
            onClick={() => onClose("exit")}
            aria-label="Exit the tutorial"
            title="Close this tutorial — it won't open by itself again"
            className="-mr-2 inline-flex min-h-11 items-center gap-1.5 px-2 font-mono text-[10.5px] tracking-[0.14em] text-locker-ink-muted uppercase transition-colors hover:text-landing-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
          >
            {/* Visible text is aria-hidden because the button's accessible
                name already carries the fuller wording. */}
            <span aria-hidden>Exit</span>
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {/* The step itself, which scrolls between the pinned header and
            footer when the screen is too short for it. It takes focus itself
            because nothing inside it can, and Safari doesn't make scroll
            containers keyboard-focusable: without tabIndex, a keyboard user on
            a short screen could never reach the text under the map.

            Below lg the map stacks above the text, except on short screens
            (see the short variants in index.css): side by side there when
            there is the width for it, and the map capped either way, so a
            landscape phone or a zoomed-in desktop still opens each step with
            its highlight and its text in view. */}
        <div
          ref={stepScrollerRef}
          role="region"
          aria-labelledby={stepTitleId}
          tabIndex={0}
          className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-locker-leather lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] short-wide:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]"
        >
          <div className="flex items-center border-b border-landing-light bg-landing-hero/60 p-3 sm:p-5 lg:border-r lg:border-b-0 short-wide:items-start short-wide:border-r short-wide:border-b-0">
            <div className="w-full short:*:max-h-[45dvh] short-wide:sticky short-wide:top-0">
              <TutorialPageMap
                pageName={tutorial.pageName}
                regions={tutorial.regions}
                activeRegionId={step.regionId}
                stepNumber={stepIndex + 1}
              />
            </div>
          </div>
          {/* Announces each new step as it arrives — where it is in the
              tutorial, then its title, summary and points together — for
              anyone who can't see the map change. */}
          <div aria-live="polite" aria-atomic="true" className="p-4 sm:p-6">
            <p className="sr-only">
              Step {stepIndex + 1} of {stepCount}.
            </p>
            <h2 id={stepTitleId} className="font-display text-xl tracking-[0.02em] text-landing-ink uppercase sm:text-2xl">
              {step.title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-landing-ink">{step.summary}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {step.points.map((point) => (
                <li key={point} className="flex gap-2.5 text-[12.5px] leading-relaxed text-locker-ink-muted">
                  <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 bg-locker-leather" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-landing-light px-3 py-2 sm:px-5">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => onClose("skip-all")}
              aria-label="Skip all tutorials"
              title="Close this tutorial and stop tutorials opening by themselves on every page"
              className={QUIET_BUTTON_CLASSES}
            >
              <span aria-hidden>Skip all</span>
            </button>
            <button
              type="button"
              onClick={() => onClose("skip")}
              aria-label="Skip this tutorial"
              title="Close this tutorial — it won't open by itself again"
              className={QUIET_BUTTON_CLASSES}
            >
              <span aria-hidden>Skip</span>
            </button>
          </div>

          {/* Decorative: "Step N of M" above already says where you are. Left
              out below sm, where it would cost a third footer row the step's
              text needs more. */}
          <ol aria-hidden className="hidden justify-center gap-1.5 sm:flex sm:flex-1">
            {tutorial.steps.map((tutorialStep, index) => (
              <li
                key={tutorialStep.title}
                className={cn(
                  "h-1.5 transition-[width,background-color] duration-300 motion-reduce:transition-none",
                  index === stepIndex ? "w-5 bg-locker-leather" : "w-1.5 bg-landing-light"
                )}
              />
            ))}
          </ol>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={goToPreviousStep}
              disabled={isFirstStep}
              aria-label="Previous step"
              className={SECONDARY_BUTTON_CLASSES}
            >
              <ChevronLeft aria-hidden className="size-4" />
              <span aria-hidden>Previous</span>
            </button>
            <button
              ref={primaryButtonRef}
              type="button"
              onClick={advanceOrComplete}
              aria-label={isLastStep ? "Complete the tutorial" : "Next step"}
              className={PRIMARY_BUTTON_CLASSES}
            >
              <span aria-hidden>{isLastStep ? "Complete" : "Next"}</span>
              {isLastStep ? <Check aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
