import { ApiError, mapHttpStatusToCode } from "@/shared/errors/ApiError";
import type { DevSession } from "@/services/session/DevSessionConnector";
import { devSessionConnector } from "@/services/session/DevSessionConnector";

export type ApiRequestOptions = {
  method?: string;
  query?: Record<string, string | number | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** When false, omit Authorization / tenant headers even if session exists. */
  withSession?: boolean;
  sessionOverride?: DevSession | null;
};

export type ApiResponse<T> = {
  data: T;
  etag: string | null;
  status: number;
  headers: Headers;
};

function buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

function resolveSession(
  options: ApiRequestOptions,
): DevSession | null {
  if (options.sessionOverride !== undefined) {
    return options.sessionOverride;
  }
  if (options.withSession === false) return null;
  if (import.meta.env.PROD) return null;
  return devSessionConnector?.getSession() ?? null;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const session = resolveSession(options);
  const headers = new Headers(options.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (session) {
    if (session.bearerToken) {
      headers.set("Authorization", `Bearer ${session.bearerToken}`);
    }
    if (session.tenantId) {
      headers.set("X-AIEOS-Tenant-ID", session.tenantId);
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    throw new ApiError("Network request failed", {
      code: "network",
      cause,
    });
  }

  const etag = response.headers.get("ETag");

  if (!response.ok) {
    let detail: unknown = undefined;
    const contentType = response.headers.get("Content-Type") ?? "";
    try {
      if (contentType.includes("json")) {
        detail = await response.json();
      } else {
        detail = await response.text();
      }
    } catch {
      detail = undefined;
    }
    const code = mapHttpStatusToCode(response.status);
    const title =
      detail &&
      typeof detail === "object" &&
      detail !== null &&
      "title" in detail &&
      typeof (detail as { title: unknown }).title === "string"
        ? (detail as { title: string }).title
        : `HTTP ${response.status}`;
    throw new ApiError(title, { code, status: response.status, detail });
  }

  if (response.status === 204) {
    return { data: undefined as T, etag, status: response.status, headers: response.headers };
  }

  const data = (await response.json()) as T;
  return { data, etag, status: response.status, headers: response.headers };
}
