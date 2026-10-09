import { Global, Module } from "@nestjs/common";
import { ApiKeyLookupService } from "./api-key-lookup.service.js";
import { ApiUsageRecorder } from "./api-usage-recorder.service.js";
import { ConsumerRateLimiter } from "./consumer-rate-limiter.service.js";

// Global so there is exactly one of each for the whole app. ApiKeyGuard is
// instantiated separately by every module whose controllers list it, so
// the key cache and rate-limit counts can't live on the guard itself: each
// module would count its own share of a consumer's requests.
@Global()
@Module({
  providers: [ApiKeyLookupService, ConsumerRateLimiter, ApiUsageRecorder],
  exports: [ApiKeyLookupService, ConsumerRateLimiter, ApiUsageRecorder],
})
export class ApiKeyAccessModule {}
