export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const lower = message.toLowerCase();

  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("quota")) {
    return "The AI provider is rate-limiting requests right now. We will retry the investigation shortly.";
  }
  if (lower.includes("authentication failed") || lower.includes("could not read username")) {
    return "Could not authenticate with GitHub. Reconnect the GitHub App and try again.";
  }
  if (
    lower.includes("repository not found") ||
    /fatal:\s*repository\s+.*\s+not found/i.test(message) ||
    (error instanceof HttpError && error.status === 404 && lower.includes("github api"))
  ) {
    return "The repository is not reachable with the connected GitHub permissions. Check the installation and try again.";
  }
  if (
    lower.includes("tool_use_failed") ||
    lower.includes("failed to parse tool call") ||
    lower.includes("invalid tool call arguments")
  ) {
    return "The AI model returned an invalid response. Please try again.";
  }
  if (lower.includes("timed out") || /\b(?:etimedout|timedout)\b/i.test(message)) {
    return "The investigation timed out. Please try again with a smaller error report.";
  }
  return message.slice(0, 1000);
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      return new HttpError(status, error instanceof Error ? error.message : "Request failed");
    }
  }
  return new HttpError(500, error instanceof Error ? error.message : "Internal server error");
}
