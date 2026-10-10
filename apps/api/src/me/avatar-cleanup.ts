import { Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const DEFAULT_AVATARS_BUCKET = "profile pictures";
// Storage lists 100 objects per call by default. A user only ever has one
// current avatar (a re-upload removes the old one), so this is generous.
const MAX_AVATARS_LISTED = 1000;

const logger = new Logger("AvatarCleanup");
let cleanupClient: SupabaseClient | undefined;

/**
 * Creates a Supabase client for the private avatars bucket, authenticated
 * with the server-only secret key.
 *
 * This app only ever uses Storage, never Realtime, but createClient
 * unconditionally constructs a RealtimeClient internally, and on Node < 22
 * (no native WebSocket global) that constructor throws unless a WebSocket
 * implementation is supplied. Supplying `ws` isn't opting into Realtime,
 * it's satisfying a constructor dependency this app never calls.
 */
export function createAvatarStorageClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SECRET_KEY ?? "", {
    realtime: { transport: WebSocket as never },
  });
}

/** The bucket avatars live in (SUPABASE_AVATARS_BUCKET, "profile pictures" by default). */
export function getAvatarsBucket(): string {
  return process.env.SUPABASE_AVATARS_BUCKET ?? DEFAULT_AVATARS_BUCKET;
}

/**
 * Deletes every avatar object a user has stored, once their account is gone.
 *
 * Avatars are stored under `{userId}/` (see AvatarStorageService), so this
 * removes the whole folder: the current photo and any orphan a failed
 * cleanup left behind. Deleting the User row can't do this, because the
 * photos live in Supabase Storage, not Postgres; without it, a deleted
 * account's photo stayed in the bucket indefinitely.
 *
 * Best effort: the account is already deleted when this runs, so a Storage
 * failure is logged with the user id (for a manual cleanup) rather than
 * thrown.
 *
 * @param userId - the deleted user's id, which is also their folder name.
 * @param client - the Storage client; a shared one is created on first use.
 */
export async function deleteUserAvatars(userId: string, client?: SupabaseClient): Promise<void> {
  try {
    const bucket = (client ?? getCleanupClient()).storage.from(getAvatarsBucket());
    const { data: storedObjects, error: listError } = await bucket.list(userId, { limit: MAX_AVATARS_LISTED });
    if (listError) throw listError;

    const objectPaths = (storedObjects ?? []).map((storedObject) => `${userId}/${storedObject.name}`);
    if (objectPaths.length === 0) return;

    const { error: removeError } = await bucket.remove(objectPaths);
    if (removeError) throw removeError;
  } catch (error) {
    logger.warn(`Could not delete the avatars of deleted user ${userId}: ${(error as Error).message}`);
  }
}

// Created on first use rather than at import: auth.config.ts imports this
// file, and it is loaded by every guard, including in tests that never
// touch Storage.
function getCleanupClient(): SupabaseClient {
  cleanupClient ??= createAvatarStorageClient();
  return cleanupClient;
}
