import { Injectable, Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { buildCacheKey, ResponseCacheService } from "../cache/response-cache.service.js";

// How long a signed evidence URL stays valid, and how long this class may
// serve the same one from cache. Same arrangement and the same reasoning as
// AvatarStorageService: the cache TTL sits comfortably under the signature's
// own lifetime so a cached URL is never handed out past the point Supabase
// would reject it.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;
const SIGNED_URL_CACHE_TTL_MS = 55 * 60 * 1000;

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  // PDFs are accepted here and not for avatars because a league's published
  // stat page usually is one.
  "application/pdf": "pdf",
};

export const ALLOWED_EVIDENCE_MIME_TYPES = Object.keys(MIME_TYPE_TO_EXTENSION);

// Larger than the 5MB avatar ceiling: a phone photograph of a scoresheet is
// routinely bigger than a profile picture, and rejecting somebody's only
// proof over file size would defeat the point of asking for it.
export const MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * The private Supabase Storage bucket holding uploaded scoresheets.
 *
 * Modelled directly on AvatarStorageService, and private for a stronger
 * reason: a scoresheet carries other people's names — teammates, opponents,
 * often minors. Only an object PATH is ever persisted (on
 * ProspectEvidence.objectPath); a renderable URL exists only for as long as a
 * signed one is valid, and the API hands one out only to the owner of the
 * season or to an admin reviewing it. The public payload carries the review
 * status and never the file.
 */
@Injectable()
export class EvidenceStorageService {
  private readonly logger = new Logger(EvidenceStorageService.name);
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(private readonly cache: ResponseCacheService) {
    // Constructed eagerly for the same reason the avatar client is: a missing
    // or malformed SUPABASE_URL should fail at boot rather than on somebody's
    // first upload. The `ws` transport satisfies a RealtimeClient constructor
    // dependency this app never actually uses — see AvatarStorageService.
    this.client = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SECRET_KEY ?? "", {
      realtime: { transport: WebSocket as never },
    });
    this.bucket = process.env.SUPABASE_EVIDENCE_BUCKET ?? "prospect evidence";
  }

  // {userId}/{seasonId}/{uuid}.{ext} — namespacing by user then season means
  // one person's upload can never collide with or overwrite another's, and
  // the uuid means their own re-uploads do not collide with each other.
  private objectPathFor(userId: string, seasonId: string, mimeType: string): string {
    const extension = MIME_TYPE_TO_EXTENSION[mimeType];
    return `${userId}/${seasonId}/${randomUUID()}.${extension}`;
  }

  async uploadEvidence(
    userId: string,
    seasonId: string,
    file: { buffer: Buffer; mimetype: string }
  ): Promise<string> {
    const objectPath = this.objectPathFor(userId, seasonId, file.mimetype);
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) {
      throw new Error(`Failed to upload evidence: ${error.message}`);
    }
    return objectPath;
  }

  // Best-effort, like the avatar equivalent: a stale object costs a few KB,
  // while failing somebody's delete over a cleanup step would be a far worse
  // trade. Logged so a pile of orphans is at least discoverable.
  async deleteObjectBestEffort(objectPath: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([objectPath]);
    if (error) {
      this.logger.warn(`Failed to delete evidence object ${objectPath}: ${error.message}`);
    }
  }

  // Cached per object path: a prospect page carrying several documents would
  // otherwise sign each one on every single request even though each URL
  // stays valid for an hour.
  createSignedEvidenceUrl(objectPath: string): Promise<string | null> {
    return this.cache.getOrLoad(
      buildCacheKey("prospect-evidence:signed-url", [objectPath]),
      SIGNED_URL_CACHE_TTL_MS,
      () => this.readSignedEvidenceUrl(objectPath)
    );
  }

  private async readSignedEvidenceUrl(objectPath: string): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SECONDS);

    if (error || !data) {
      this.logger.warn(`Failed to sign evidence URL for ${objectPath}: ${error?.message ?? "no data"}`);
      return null;
    }
    return data.signedUrl;
  }
}
