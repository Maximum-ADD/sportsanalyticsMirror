# API version negotiation

The URL identifies the API version, for example `GET /v1/players`.
Consumers can additionally send `Accept-Version: 1`; the API responds with
`API-Version: 1`.

A request for an unsupported version receives `406` in the standard API error
envelope rather than silently receiving an incompatible response. Existing
`/v1/...` callers that omit the header remain fully supported.
