import { useState } from "react";
import { cn } from "@/lib/utils";
import { getPlayerHeadshotUrl } from "@/lib/nbaMedia";
import type { Player } from "@/types/nba";

interface PlayerHeadshotProps {
  player: Pick<Player, "nbaPlayerId" | "firstName" | "lastName">;
  size?: "sm" | "md" | "lg";
  className?: string;
  // Defaults to the player's name — right for a headshot presented on its
  // own (profile hero, prediction cards), where the image IS the label.
  // Pass an empty string when the player's name already appears as text
  // next to the photo (table rows, leader cards): duplicating it in the
  // alt makes screen readers announce the name twice (axe
  // image-redundant-alt), and the photo is decorative there.
  alt?: string;
}

const SIZE_CLASSES = {
  sm: "size-10 text-sm",
  // Between the two: large enough to recognise a face in a grid tile,
  // small enough that five of them across a panel still read as a row of
  // tiles rather than as a gallery.
  md: "size-14 text-lg md:size-16 md:text-xl",
  // The page's main photos — the profile hero, Compare, the top-scorer
  // cards. The reviewer found these small on a desktop, where there is room
  // to spare, so each size steps up at the wider breakpoints. The base size
  // (a phone width) is unchanged — that is the one the reviewer found fine.
  // The CDN image is 1040x760 (see lib/nbaMedia.ts), far beyond every size
  // here, so the step-up costs no sharpness.
  lg: "size-20 text-2xl md:size-24 md:text-3xl lg:size-28 lg:text-4xl",
};

// Not every player has a real headshot at this id (two-way/G-League call-ups,
// very recent draftees) — falls back to the same initials-circle treatment
// this replaced rather than a broken-image icon.
export function PlayerHeadshot({ player, size = "lg", className, alt }: PlayerHeadshotProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];
  const imageAlt = alt ?? `${player.firstName} ${player.lastName}`;

  if (!photoFailed) {
    return (
      <img
        src={getPlayerHeadshotUrl(player.nbaPlayerId)}
        alt={imageAlt}
        className={cn("shrink-0 rounded-full bg-surface-raised object-cover", sizeClass, className)}
        onError={() => setPhotoFailed(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-surface-raised font-semibold text-text-secondary",
        sizeClass,
        className
      )}
    >
      {player.firstName[0]}
      {player.lastName[0]}
    </div>
  );
}
