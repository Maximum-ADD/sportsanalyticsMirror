import type { ReactNode } from "react";

interface LockerSectionProps {
  title: string;
  /** Optional right-aligned control, e.g. a "Manage" toggle. */
  action?: ReactNode;
  children: ReactNode;
}

// The recurring section header on /home: a condensed uppercase label, a
// hairline rule that eats the remaining width, and an optional ghost action
// on the right. The rule is what gives a dense page rhythm without spending
// a border or a card on every group.
export function LockerSection({ title, action, children }: LockerSectionProps) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          {title}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
        {action}
      </div>
      {children}
    </section>
  );
}
