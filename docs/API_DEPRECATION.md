# API deprecation policy

The public API uses URL versions. A retiring route stays available during a
notice period while its replacement is published at the successor URL.

Deprecated routes send `Deprecation`, `Sunset`, and `Link` response headers.
The link has `rel="successor-version"` and points clients to the replacement.

New deprecations must use `@DeprecateEndpoint` with both a successor path and
sunset date, be marked deprecated in Swagger, and give clients at least one
full release cycle of notice before removal.

## Current deprecation

`GET /health` is deprecated in favour of `GET /v1/health`. It remains
available until 31 March 2027 and continues returning `{ "status": "ok" }`
while clients migrate to the versioned route.
