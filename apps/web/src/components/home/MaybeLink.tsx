import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface MaybeLinkProps {
  /**
   * Where the card should navigate, or undefined when it has no real
   * destination yet.
   */
  to?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Renders a router Link when there is somewhere real to go, and a plain
 * element otherwise.
 *
 * @param to - the route to navigate to, or undefined for a non-navigating card.
 * @param className - styling shared by both branches, so the card looks the
 *                    same either way.
 * @returns the card, wrapped in a Link only when `to` is set.
 *
 * This exists because /home renders placeholder rows while it waits to be
 * wired to the API, and a placeholder has no database id to link to. Earlier
 * these cards linked using `nbaPlayerId` (the nba.com id) or a literal
 * "placeholder-jokic" string, but every route under /players/:id, /teams/:id
 * and /games/:id resolves an INTERNAL uuid — so each card fired a request
 * that could only ever 404, and a full watchlist produced a burst of them on
 * every render.
 *
 * Making the destination optional keeps the fix honest in both directions: a
 * card with no real target simply does not pretend to be clickable, and once
 * real rows arrive with real ids the same components navigate normally.
 */
export function MaybeLink({ to, className, children }: MaybeLinkProps) {
  if (!to) {
    return <div className={className}>{children}</div>;
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}
