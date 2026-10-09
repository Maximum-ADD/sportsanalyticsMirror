/**
 * Every way ESPN's injury feed can fail us, as one error type: unreachable,
 * an unexpected status, or a payload in a shape the parser doesn't recognise.
 * The controller turns any of them into a 503, and the message names the
 * cause for whoever reads the logs or the response.
 */
export class InjuryFeedUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InjuryFeedUnavailableError";
  }
}
