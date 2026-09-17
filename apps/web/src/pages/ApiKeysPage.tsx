import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createMyApiKey,
  deleteMyApiKey,
  fetchMyApiKeys,
  revokeMyApiKey,
} from "@/lib/meApi";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";

const INPUT_CLASS =
  "border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink placeholder:text-locker-ink-muted focus:border-locker-leather focus:outline-none";
const BUTTON_CLASS =
  "min-h-10 border border-landing-light bg-locker-surface px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-landing-ink uppercase transition-colors hover:border-locker-leather disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0";
const PANEL_CLASS = "border border-landing-light bg-locker-surface p-4";

function formatKeyLabel(key: { id: string; label: string | null }): string {
  return key.label ?? `Key ${key.id.slice(0, 8)}`;
}

// The signed-in user's own API keys — the same key machinery the admin
// "API Keys" tab manages for external consumers, scoped to this user.
// Revoking deactivates a key (it stays listed); deleting removes it for
// good. The raw key is only ever shown once, in the yellow box right
// after generation.
export function ApiKeysPage() {
  const [newLabel, setNewLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["myApiKeys"],
    queryFn: fetchMyApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: () => createMyApiKey(newLabel.trim() || undefined),
    onSuccess: (result) => {
      setCreatedKey(result.rawKey);
      setNewLabel("");
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

  if (isError) {
    return <ErrorState message="Could not load API keys." onRetry={() => refetch()} />;
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        <div className="mb-6 border border-landing-light bg-locker-surface p-6">
          <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">API Keys</h1>
          <p className="mt-2 text-[12.5px] text-locker-ink-muted">
            Create keys to call this platform's API from your own scripts and tools. Send the key as
            the <code className="font-mono text-[11px]">X-API-Key</code> request header, the same way
            external integrations authenticate.
          </p>
        </div>

        <div className={PANEL_CLASS}>
          <h2 className="font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">New Key</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              aria-label="Key label"
              className={INPUT_CLASS}
              placeholder="Label (optional, e.g. laptop)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
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

        {createdKey && (
          <div className="mt-4 border border-yellow-300 bg-yellow-50 p-4">
            <p className="font-mono text-[11px] tracking-[0.1em] text-yellow-800 uppercase">
              New API Key (copy now — shown only once)
            </p>
            <code className="mt-2 block break-all font-mono text-[13px] text-yellow-900">{createdKey}</code>
            <button type="button" className={`${BUTTON_CLASS} mt-2`} onClick={() => setCreatedKey(null)}>
              Dismiss
            </button>
          </div>
        )}

        {data?.consumer && (
          <p className="mt-4 font-mono text-[10px] tracking-[0.08em] text-locker-ink-muted uppercase">
            Usage across all your keys: {data.consumer.usageCount} requests · limit{" "}
            {data.consumer.rateLimit}/min and {data.consumer.dailyQuota}/day
          </p>
        )}

        {isPending ? (
          <div className="mt-4 flex min-h-64 items-center justify-center">
            <BasketballSpinner size="lg" label="Loading API keys" />
          </div>
        ) : (
          <div className="mt-4 overflow-hidden border border-landing-light bg-locker-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-landing-light bg-landing-hero">
                  {["Key", "Status", "Last Used", "Created", ""].map((header) => (
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
                    <td colSpan={5} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
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
                            key.isActive ? "text-green-600" : "text-locker-bad"
                          }`}
                        >
                          {key.isActive ? "● Active" : "○ Revoked"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-locker-ink-muted">
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-locker-ink-muted">
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
    </div>
  );
}
