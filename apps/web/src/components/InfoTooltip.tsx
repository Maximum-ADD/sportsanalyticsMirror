import { useEffect, useId, useRef, useState } from "react";

/**
 * A small "i" button that reveals an explanation next to a section heading.
 *
 * Built as a DISCLOSURE rather than as a hover tooltip, deliberately. A
 * hover-only tooltip cannot be opened by a keyboard and does not exist at
 * all on a touch screen, so the explanation would simply be unavailable to
 * a good share of readers — and the root README already lists accessibility
 * coverage as a gap rather than something to add more of.
 *
 * It therefore opens on click or Enter/Space, closes on Escape or a click
 * outside, and the panel is tied to the button with aria-controls plus
 * aria-expanded, so a screen reader announces both that the control exists
 * and whether it is open.
 */
export function InfoTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        // The outline, not just a border-colour change, is what shows
        // keyboard focus: the border shift on a 20px square is too faint to
        // find on a page that now carries several of these buttons.
        className="flex size-5 items-center justify-center border border-landing-light font-display text-[11px] text-locker-ink-muted transition hover:border-locker-leather hover:text-locker-leather focus:border-locker-leather focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
      >
        i
      </button>
      {isOpen && (
        <div
          id={panelId}
          // Anchored to the right edge so a panel hanging off a heading's
          // right-hand side stays on screen instead of overflowing.
          className="absolute top-7 right-0 z-20 w-72 border border-landing-light bg-locker-surface p-3 text-[12px] leading-relaxed text-locker-ink-muted shadow-lg sm:w-80"
        >
          {children}
        </div>
      )}
    </div>
  );
}
