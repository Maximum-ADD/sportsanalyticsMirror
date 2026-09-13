interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

// A load failure rendered the same way the auth wall renders "Sign in
// required": a centered card on the shared locker background. Filling the
// available area (rather than sitting as a small panel at the top of the
// page) keeps a failed page from looking empty around the message — the
// failure IS the page state, so it gets the page's visual weight.
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex min-h-full items-center justify-center bg-landing-hero">
      <section className="mx-auto flex max-w-lg flex-col items-center gap-4 border border-landing-light bg-locker-surface px-8 py-10 text-center">
        <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">
          Something went wrong
        </h1>
        <p className="text-[12.5px] text-locker-ink-muted">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
        >
          Retry
        </button>
      </section>
    </div>
  );
}
