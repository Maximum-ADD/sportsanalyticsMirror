// The locker form vocabulary, shared by every Become Pro form so they read as
// part of the same app as Profile, Admin and the player pages.
//
// These are the exact class strings those pages already use —
// ApiKeysSection's INPUT_CLASS, PlayerProfilePage's LOCKER_BUTTON_CLASS and
// adminStyles' LABEL_CLASS — rather than near-copies that would drift a pixel
// at a time.

export const LABEL_CLASS = "font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase";

export const INPUT_CLASS =
  "border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink placeholder:text-locker-ink-muted focus:border-locker-leather focus:outline-none";

export const BUTTON_CLASS =
  "min-h-10 border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] whitespace-nowrap text-landing-ink uppercase transition-colors hover:border-locker-leather disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0";

export const QUIET_BUTTON_CLASS =
  "min-h-10 border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] whitespace-nowrap text-locker-ink-muted uppercase transition-colors hover:border-locker-leather hover:text-landing-ink disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0";

export const DANGER_BUTTON_CLASS =
  "min-h-10 border border-locker-bad bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] whitespace-nowrap text-locker-bad uppercase transition-colors hover:bg-locker-bad/10 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0";
