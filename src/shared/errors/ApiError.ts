export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "precondition_required"
  | "precondition_failed"
  | "not_found"
  | "validation"
  | "unavailable"
  | "network"
  | "unknown";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  readonly detail: unknown;

  constructor(
    message: string,
    options: {
      code: ApiErrorCode;
      status?: number | null;
      detail?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status ?? null;
    this.detail = options.detail;
  }
}

export function mapHttpStatusToCode(status: number): ApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 412) return "precondition_failed";
  if (status === 428) return "precondition_required";
  if (status === 422 || status === 400) return "validation";
  if (status === 503) return "unavailable";
  return "unknown";
}

export function userMessageForApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "unauthorized":
      case "forbidden":
        return "Session or access failure. Connect a valid DEV session and retry.";
      case "precondition_failed":
        return "This artifact changed since you loaded it. Refresh and try again.";
      case "precondition_required":
        return "A required precondition header was missing (client contract error).";
      case "not_found":
        return "The requested item was not found.";
      case "unavailable":
        return "The service is temporarily unavailable.";
      case "network":
        return "Could not reach the API. Check the proxy target and backend.";
      default:
        return error.message || "Request failed.";
    }
  }
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
