interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 border border-landing-light bg-locker-surface p-5">
      <p className="text-[12.5px] text-locker-bad">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
      >
        Retry
      </button>
    </div>
  );
}
