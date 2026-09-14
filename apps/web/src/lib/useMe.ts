import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/authClient";
import { fetchMe } from "@/lib/meApi";

export const ME_QUERY_KEY = ["me"];

// GET /v1/me, gated on an actual session existing — there is no point
// firing this (and no session cookie to authenticate it with) before
// BetterAuth's own useSession has resolved a signed-in user. Every caller
// that needs the onboarding gate (username === null) or the profile's own
// data reads through this one hook rather than each re-implementing the
// `enabled: !!session` guard.
export function useMe() {
  const { data: session, isPending: isSessionPending } = useSession();

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    enabled: Boolean(session),
  });

  return { ...meQuery, isPending: isSessionPending || (Boolean(session) && meQuery.isPending), session };
}
