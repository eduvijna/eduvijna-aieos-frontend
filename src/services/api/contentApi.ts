import { apiRequest } from "./client";
import type {
  ContentPublishRequest,
  ContentResponse,
  ContentVersionResponse,
  PublicationResponse,
} from "./generated/contentTypes";

export async function getContent(contentId: string) {
  return apiRequest<ContentResponse>(`/api/v1/contents/${contentId}`, {
    method: "GET",
  });
}

export async function getContentVersion(contentId: string, versionId: string) {
  return apiRequest<ContentVersionResponse>(
    `/api/v1/contents/${contentId}/versions/${versionId}`,
    { method: "GET" },
  );
}

export async function postContentPublish(
  contentId: string,
  body: ContentPublishRequest,
  etag: string,
  idempotencyKey: string,
) {
  return apiRequest<PublicationResponse>(
    `/api/v1/contents/${contentId}/actions/publish`,
    {
      method: "POST",
      body,
      headers: {
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}

export type PublishPrecheckReason =
  | "missing_etag"
  | "not_approved"
  | "version_drift"
  | "already_published";

export class PublishPrecheckError extends Error {
  readonly reason: PublishPrecheckReason;
  readonly content: ContentResponse;

  constructor(reason: PublishPrecheckReason, content: ContentResponse) {
    super(`Publish precheck failed: ${reason}`);
    this.name = "PublishPrecheckError";
    this.reason = reason;
    this.content = content;
  }
}

/**
 * Authoritative publish: GET Content first, verify APPROVED + generation-bound
 * current version + not already published, then POST with If-Match.
 */
export async function publishApprovedContentVersion(options: {
  contentId: string;
  /** Generation-bound version the teacher selected — never a different current. */
  versionId: string;
  idempotencyKey: string;
}) {
  const contentResponse = await getContent(options.contentId);
  const content = contentResponse.data;
  const etag = contentResponse.etag;

  if (!etag) {
    throw new PublishPrecheckError("missing_etag", content);
  }
  if (content.stewardship_state !== "APPROVED") {
    throw new PublishPrecheckError("not_approved", content);
  }
  if (content.current_version_id !== options.versionId) {
    throw new PublishPrecheckError("version_drift", content);
  }
  if (content.published_version_id === options.versionId) {
    throw new PublishPrecheckError("already_published", content);
  }

  return postContentPublish(
    options.contentId,
    { version_id: options.versionId },
    etag,
    options.idempotencyKey,
  );
}
