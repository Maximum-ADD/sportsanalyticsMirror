import { useState } from "react";
import { cn } from "@/lib/utils";
import { getPlayerHeadshotUrl } from "@/lib/nbaMedia";
import type { Player } from "@/types/nba";

interface PlayerHeadshotProps {
  player: Pick<Player, "nbaPlayerId" | "firstName" | "lastName">;
  size?: "sm" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "size-10 text-sm",
  lg: "size-20 text-2xl",
};

// Not every player has a real headshot at this id (two-way/G-League call-ups,
// very recent draftees) — falls back to the same initials-circle treatment
// this replaced rather than a broken-image icon.
export function PlayerHeadshot({ player, size = "lg", className }: PlayerHeadshotProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];

  if (!photoFailed) {
    return (
      <img
        src={getPlayerHeadshotUrl(player.nbaPlayerId)}
        alt={`${player.firstName} ${player.lastName}`}
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
