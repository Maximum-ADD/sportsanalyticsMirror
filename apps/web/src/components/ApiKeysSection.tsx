import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createMyApiKey,
  deleteMyApiKey,
  fetchMyApiKeys,
  revokeMyApiKey,
} from "@/lib/meApi";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";

const INPUT_CLASS =
  "border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink placeholder:text-locker-ink-muted focus:border-locker-leather focus:outline-none";
const BUTTON_CLASS =
  "min-h-10 border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] whitespace-nowrap text-landing-ink uppercase transition-colors hover:border-locker-leather disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0";
const TABLE_HEADERS = ["Key", "Status", "Last Used", "Created", ""];

/**
 * Display name for a key row: the label the user chose, or a short prefix
 * of the key's id when they left the label blank at generation time. The
 * raw key itself is never available here — it is shown once, at creation.
 */
function formatKeyLabel(key: { id: string; label: string | null }): string {
  return key.label ?? `Key ${key.id.slice(0, 8)}`;
}

/**
 * The signed-in user's own API keys, rendered as a Profile section rather
 * than a standalone page — it is account configuration, alongside avatar
 * and username, not a destination of its own.
 *
 * This is the same key machinery the admin "API Keys" tab manages for
 * external consumers, scoped to this user. Revoking deactivates a key (it
 * stays listed, so its usage history is still legible); deleting removes
 * it for good. The raw key is only ever shown once, in the highlighted box
 * right after generation.
 */
export function ApiKeysSection() {
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["myApiKeys"],
    queryFn: fetchMyApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: () => createMyApiKey(newKeyLabel.trim() || undefined),
    onSuccess: (result) => {
      setCreatedRawKey(result.rawKey);
      setNewKeyLabel("");
      refetch();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeMyApiKey(keyId),
    onSuccess: () => refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => deleteMyApiKey(keyId),
    onSuccess: () => refetch(),
  });

  // Inline rather than a full-page ErrorState: a failed key fetch should
  // not blank out the rest of the profile around it.
  if (isError) {
    return (
      <p className="border border-landing-light bg-locker-surface p-4 text-[12.5px] text-locker-ink-muted">
        <span>Could not load API keys.</span>{" "}
        <button type="button" onClick={() => refetch()} className="underline hover:text-landing-ink">
          Try again
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-locker-ink-muted">
        Create keys to call this platform's API from your own scripts and tools. Send the key as the{" "}
        <code className="font-mono text-[11px]">X-API-Key</code> request header, the same way external
        integrations authenticate.
      </p>

      <div className="border border-landing-light bg-locker-surface p-4">
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Key label"
            className={INPUT_CLASS}
            placeholder="Label (optional, e.g. laptop)"
            value={newKeyLabel}
            onChange={(event) => setNewKeyLabel(event.target.value)}
          />
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Generating…" : "Generate Key"}
          </button>
        </div>
        {createMutation.isError && (
          <p className="mt-2 text-[11px] text-locker-bad">Failed to generate key</p>
        )}
      </div>

      {createdRawKey && (
        <div className="border border-yellow-300 bg-yellow-50 p-4">
          <p className="font-mono text-[10px] tracking-[0.1em] text-yellow-800 uppercase">
            New API Key (copy now — shown only once)
          </p>
          <code className="mt-2 block break-all font-mono text-[13px] text-yellow-900">
            {createdRawKey}
          </code>
          <button type="button" className={`${BUTTON_CLASS} mt-2`} onClick={() => setCreatedRawKey(null)}>
            Dismiss
          </button>
        </div>
      )}

      {data?.consumer && (
        <p className="font-mono text-[10px] tracking-[0.08em] text-locker-ink-muted uppercase">
          Usage across all your keys: {data.consumer.usageCount} requests · limit{" "}
          {data.consumer.rateLimit}/min and {data.consumer.dailyQuota}/day
        </p>
      )}

      {isPending ? (
        <div className="flex min-h-32 items-center justify-center">
          <BasketballSpinner size="lg" label="Loading API keys" />
        </div>
      ) : (
        // Horizontal scroll rather than a wrap: the profile column is
        // narrower than the old standalone page, and five columns of
        // key metadata do not fit a phone.
        <div className="overflow-x-auto border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {TABLE_HEADERS.map((header) => (
                  <th
                    key={header}
                    className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.keys.length === 0 ? (
                <tr>
                  <td
                    colSpan={TABLE_HEADERS.length}
                    className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted"
                  >
                    No API keys yet — generate one above to get started.
                  </td>
                </tr>
              ) : (
                data?.keys.map((key) => (
                  <tr key={key.id} className="border-b border-landing-light last:border-b-0">
                    <td className="px-3 py-2.5 font-mono text-[11px] text-landing-ink">
                      {formatKeyLabel(key)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`font-mono text-[10px] uppercase ${
                          key.isActive ? "text-locker-good" : "text-locker-bad"
                        }`}
                      >
                        {key.isActive ? "● Active" : "○ Revoked"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10px] whitespace-nowrap text-locker-ink-muted">
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10px] whitespace-nowrap text-locker-ink-muted">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        {key.isActive && (
                          <button
                            type="button"
                            className={BUTTON_CLASS}
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(key.id)}
                          >
                            Revoke
                          </button>
                        )}
                        <button
                          type="button"
                          className={BUTTON_CLASS}
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(key.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
