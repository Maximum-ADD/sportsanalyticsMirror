import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markTutorialSeen, updateMe } from "@/lib/meApi";
import { ME_QUERY_KEY, useMe } from "@/lib/useMe";
import type { TutorialCloseReason } from "@/lib/pageTutorial";
import type { MeProfile } from "@/types/nba";

export interface PageTutorialControls {
  /** Whether the tutorial dialog should be on screen right now. */
  isOpen: boolean;
  /** Opens the tutorial on demand — the page's "?" button. */
  openTutorial: () => void;
  /** Closes the tutorial and records on the account that it has been seen. */
  closeTutorial: (reason: TutorialCloseReason) => void;
}

/** What one close has to write to the account. Both false: nothing to write. */
interface TutorialCloseWrites {
  /** The account does not yet record this tutorial as seen. */
  isMarkingSeen: boolean;
  /** The close was "Skip all", and tutorials are not already turned off. */
  isTurningTutorialsOff: boolean;
}

/**
 * Whether this user's profile says a tutorial should open by itself: they
 * have not seen it, and they have not turned tutorials off with "Skip all".
 *
 * A profile from an API that predates tutorials carries neither field, and
 * reads as "don't open" — showing a tutorial nobody can mark seen would open
 * it again on every single visit.
 */
function shouldOpenByItself(profile: MeProfile | undefined, tutorialId: string): boolean {
  if (profile?.seenTutorialIds === undefined || profile.autoOpenTutorials !== true) return false;
  return !profile.seenTutorialIds.includes(tutorialId);
}

/**
 * The profile as it will read once a close's writes have reached the API:
 * this tutorial seen, and — after "Skip all" — tutorials turned off.
 */
function recordTutorialClosed(profile: MeProfile, tutorialId: string, writes: TutorialCloseWrites): MeProfile {
  const seenTutorialIds = profile.seenTutorialIds ?? [];
  return {
    ...profile,
    seenTutorialIds: seenTutorialIds.includes(tutorialId) ? seenTutorialIds : [...seenTutorialIds, tutorialId],
    autoOpenTutorials: writes.isTurningTutorialsOff ? false : profile.autoOpenTutorials,
  };
}

/** Sends whichever of a close's two writes it needs, side by side. */
async function sendTutorialCloseWrites(tutorialId: string, writes: TutorialCloseWrites): Promise<void> {
  await Promise.all([
    writes.isMarkingSeen ? markTutorialSeen(tutorialId) : undefined,
    writes.isTurningTutorialsOff ? updateMe({ autoOpenTutorials: false }) : undefined,
  ]);
}

/**
 * Drives one page's tutorial: opens it by itself the first time this user
 * ever reaches the page, opens it again whenever they ask (the "?" button),
 * and records on their account that they have seen it, however it closes.
 *
 * "First time ever" is the account's call, not this browser's: the decision
 * reads GET /v1/me's seenTutorialIds and autoOpenTutorials, which every page
 * with a tutorial already holds (ProfileGate loads the profile before the page
 * renders), so it never waits on a request of its own.
 *
 * Recording a close is a TanStack Query optimistic update. A GET /v1/me
 * already in flight is cancelled, since it was sent before the close and could
 * only answer "unseen". The cached profile is updated at once, so leaving the
 * page and coming straight back can't reopen a tutorial whose write is still
 * on its way. Once the write settles the profile is refetched, so the cache
 * ends on the account's real state — including anything the cancelled GET was
 * fetching, such as a player just removed from the watchlist. A failed write
 * is not reported: the cost is the tutorial opening once more on a later
 * visit, which is not worth an error message.
 *
 * @param tutorialId - the tutorial's stable id (PageTutorialDefinition.id).
 * @returns whether it is open, and the two ways to change that.
 */
export function usePageTutorial(tutorialId: string): PageTutorialControls {
  const { data: me } = useMe();
  const queryClient = useQueryClient();

  // Closed this visit: keeps it shut even if a profile landing between the
  // close and the refetch still reports it unseen.
  const [isDismissed, setIsDismissed] = useState(false);
  // Opened from the "?" button, which works whatever the profile says.
  const [isReplaying, setIsReplaying] = useState(false);

  const recordCloseMutation = useMutation({
    mutationFn: (writes: TutorialCloseWrites) => sendTutorialCloseWrites(tutorialId, writes),
    onMutate: async (writes) => {
      await queryClient.cancelQueries({ queryKey: ME_QUERY_KEY });
      queryClient.setQueryData<MeProfile>(ME_QUERY_KEY, (profile) =>
        profile ? recordTutorialClosed(profile, tutorialId, writes) : profile
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });

  const isOpen = isReplaying || (!isDismissed && shouldOpenByItself(me, tutorialId));

  function openTutorial() {
    setIsReplaying(true);
  }

  function closeTutorial(reason: TutorialCloseReason) {
    setIsReplaying(false);
    setIsDismissed(true);

    // No profile, no account to record it on: a "?" replay by someone the
    // page knows nothing about yet.
    if (!me) return;
    const writes: TutorialCloseWrites = {
      isMarkingSeen: !(me.seenTutorialIds?.includes(tutorialId) ?? false),
      isTurningTutorialsOff: reason === "skip-all" && me.autoOpenTutorials !== false,
    };
    // A replay of a tutorial the account already records writes nothing, so
    // it leaves the cached profile — and any refetch of it in flight — alone.
    if (!writes.isMarkingSeen && !writes.isTurningTutorialsOff) return;
    recordCloseMutation.mutate(writes);
  }

  return { isOpen, openTutorial, closeTutorial };
}
