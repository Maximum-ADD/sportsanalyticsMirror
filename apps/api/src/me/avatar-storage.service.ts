import { Injectable, Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

// How long a signed avatar URL stays valid. Generated fresh on every
// GET /v1/me (and after a successful upload), so this only bounds how long
// a client-cached response's <img src> keeps working before the next
// refetch — it does not need to be long-lived.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const ALLOWED_AVATAR_MIME_TYPES = Object.keys(MIME_TYPE_TO_EXTENSION);

export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

// Wraps the "profile pictures" Supabase Storage bucket, which is PRIVATE
// (confirmed via the Storage API), so every operation here goes through the
// secret-key service client rather than anything the browser could call
// directly — this class is the only place in the app that ever imports
// @supabase/supabase-js. Object paths are stored on User.avatarUrl (see
// schema.prisma); a real, renderable URL only exists for as long as a
// signed URL from createSignedAvatarUrl below is valid, so nothing that
// looks like a permanent URL is ever persisted.
@Injectable()
export class AvatarStorageService {
  private readonly logger = new Logger(AvatarStorageService.name);
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor() {
    // Constructed eagerly (like auth.config.ts's own top-level `auth`
    // singleton) rather than lazily on first use — a missing/malformed
    // SUPABASE_URL should fail loudly at boot, not on a user's first avatar
    // upload.
    //
    // This app only ever uses Storage, never Realtime, but createClient
    // unconditionally constructs a RealtimeClient internally regardless —
    // and on Node < 22 (no native WebSocket global) that constructor throws
    // synchronously unless a WebSocket implementation is supplied via the
    // `realtime.transport` option, exactly as Node's own error message
    // suggests. Supplying `ws` here isn't opting into using Realtime, it's
    // satisfying a constructor dependency this app never actually calls.
    this.client = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SECRET_KEY ?? "", {
      realtime: { transport: WebSocket as never },
    });
    this.bucket = process.env.SUPABASE_AVATARS_BUCKET ?? "profile pictures";
  }

  // {userId}/{uuid}.{ext} — namespacing by userId means one user's re-upload
  // can never collide with (or overwrite) another's object path, and the
  // uuid means their own re-uploads don't collide with each other either
  // (see deleteObject below for how the previous one gets cleaned up).
  private objectPathFor(userId: string, mimeType: string): string {
    const extension = MIME_TYPE_TO_EXTENSION[mimeType];
    return `${userId}/${randomUUID()}.${extension}`;
  }

  async uploadAvatar(userId: string, file: { buffer: Buffer; mimetype: string }): Promise<string> {
    const objectPath = this.objectPathFor(userId, file.mimetype);
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) {
      throw new Error(`Failed to upload avatar: ${error.message}`);
    }
    return objectPath;
  }

  // Best-effort: a stale object left behind in Storage costs nothing but a
  // few KB, while failing someone's profile update over a cleanup step that
  // failed would be a much worse trade. Logged so a growing pile of orphans
  // is at least discoverable, not silently invisible.
  async deleteObjectBestEffort(objectPath: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([objectPath]);
    if (error) {
      this.logger.warn(`Failed to delete old avatar object ${objectPath}: ${error.message}`);
    }
  }

  async createSignedAvatarUrl(objectPath: string): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SECONDS);

    if (error || !data) {
      this.logger.warn(`Failed to sign avatar URL for ${objectPath}: ${error?.message ?? "no data"}`);
      return null;
    }
    return data.signedUrl;
  }
}
