/**
 * Every way the NBA's live feed can fail us, as one error type: unreachable,
 * refused by the CDN, an unexpected status, or a payload in a shape the
 * parsers don't recognise. The controller turns any of them into a 503, and
 * the message names the cause for whoever reads the logs or the response.
 */
export class LiveFeedUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LiveFeedUnavailableError";
  }
}
