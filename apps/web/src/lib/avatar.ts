// Mirrors AvatarStorageService's own constants on the API — validated here
// too so an obviously-invalid file is rejected before ever reaching the
// network, not just after a round trip. The API re-validates independently
// regardless (never trust client-side validation alone), so drift between
// these two lists would only ever cost a slightly-late error message, not a
// security gap.
export const ALLOWED_AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_AVATAR_SIZE_MB = 5;
