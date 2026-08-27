import { apiRequest } from "./client";
import type {
  ReviewAction,
  ReviewDecisionRequest,
  ReviewDecisionResponse,
  TeacherReviewQueueDetail,
  TeacherReviewQueueList,
} from "./generated/reviewTypes";

export async function listReviewQueue(options?: {
  limit?: number;
  cursor?: string | null;
}) {
  return apiRequest<TeacherReviewQueueList>(
    "/api/v1/teacher-os/review-queue",
    {
      method: "GET",
      query: {
        limit: options?.limit ?? 100,
        cursor: options?.cursor ?? undefined,
      },
    },
  );
}

export async function getReviewQueueDetail(
  contentId: string,
  versionId: string,
) {
  return apiRequest<TeacherReviewQueueDetail>(
    `/api/v1/teacher-os/review-queue/${contentId}/versions/${versionId}`,
    { method: "GET" },
  );
}

export async function postReviewDecision(
  contentId: string,
  versionId: string,
  action: ReviewAction,
  body: ReviewDecisionRequest,
  etag: string,
) {
  return apiRequest<ReviewDecisionResponse>(
    `/api/v1/contents/${contentId}/versions/${versionId}/actions/${action}`,
    {
      method: "POST",
      body,
      headers: {
        "If-Match": etag,
        "Idempotency-Key": crypto.randomUUID(),
      },
    },
  );
}
