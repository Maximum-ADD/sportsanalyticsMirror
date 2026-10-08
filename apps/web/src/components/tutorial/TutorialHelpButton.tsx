interface TutorialHelpButtonProps {
  /** The page's name as it reads mid-sentence, e.g. "home". */
  pageName: string;
  onClick: () => void;
}

/**
 * The floating "?" that replays a page's tutorial on demand — the way back to
 * it after it has opened by itself once, and the only way at all once a user
 * has chosen "Skip all".
 *
 * Fixed to the viewport, so it must not render inside anything with a
 * transform (Reveal's rise animation is one): a transformed ancestor becomes
 * the containing block for fixed children, and the button would scroll away
 * with the page. PageTutorial renders it at the top level of the page.
 */
export function TutorialHelpButton({ pageName, onClick }: TutorialHelpButtonProps) {
  return (
    // Stacked directly above ReadAloudControl, the app's other floating
    // control: its bottom-4 (1rem) plus its h-11 (2.75rem) plus a 0.75rem
    // gap. z-40 like it — above page content and the header, below the
    // tutorial dialog's z-50 when that is open.
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show the ${pageName} page tutorial`}
      aria-haspopup="dialog"
      className="fixed right-4 bottom-[4.5rem] z-40 inline-flex size-11 items-center justify-center border border-landing-light bg-locker-surface font-display text-xl text-landing-ink shadow-[0_10px_24px_rgba(0,0,0,0.25)] transition-colors hover:border-locker-leather hover:text-locker-leather focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
    >
      <span aria-hidden>?</span>
    </button>
  );
}
