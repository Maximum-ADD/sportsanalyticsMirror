import { SetMetadata } from "@nestjs/common";

export const DEPRECATION_NOTICE_KEY = "deprecationNotice";

export interface DeprecationNotice {
  replacementPath: string;
  sunsetAt: string;
}

// Marks a route for lifecycle headers. Both properties ensure clients know
// where to migrate and how long the old endpoint remains available.
export function DeprecateEndpoint(deprecationNotice: DeprecationNotice) {
  return SetMetadata(DEPRECATION_NOTICE_KEY, deprecationNotice);
}
