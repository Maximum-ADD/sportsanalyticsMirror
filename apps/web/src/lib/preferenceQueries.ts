import type { QueryClient } from "@tanstack/react-query";

/** Marks saved favorites and their locker views stale after a successful write.
 * Onboarding defers profile refresh until Finish because username controls its gate.
 */
export async function invalidatePreferenceQueries(queryClient: QueryClient, includeProfile = true) {
  const keys = includeProfile ? ["me", "watchlist", "teamResults"] : ["watchlist", "teamResults"];
  await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}
