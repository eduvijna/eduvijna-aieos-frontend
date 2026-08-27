import { apiRequest } from "./client";
import type {
  TeachingWork,
  TeachingWorkCreateRequest,
  TeachingWorkList,
  TeachingWorkRefineRequest,
} from "./generated/teachingTypes";

/**
 * Create a Work from a Teaching Intent request.
 *
 * Pass `idempotencyKey` to make a retry of the *same* submission safe; omit it
 * and a fresh key is generated for a genuinely new submission.
 */
export async function createTeachingWork(
  body: TeachingWorkCreateRequest,
  idempotencyKey?: string,
) {
  return apiRequest<TeachingWork>("/api/v1/teaching/works", {
    method: "POST",
    body,
    headers: {
      "Idempotency-Key": idempotencyKey ?? crypto.randomUUID(),
    },
  });
}

export async function listTeachingWorks(options?: {
  limit?: number;
  includeArchived?: boolean;
}) {
  return apiRequest<TeachingWorkList>("/api/v1/teaching/works", {
    method: "GET",
    query: {
      limit: options?.limit ?? 50,
      include_archived: options?.includeArchived ? "true" : undefined,
    },
  });
}

export async function getTeachingWork(workId: string) {
  return apiRequest<TeachingWork>(`/api/v1/teaching/works/${workId}`, {
    method: "GET",
  });
}

/** Refine a Work. `etag` comes from the preceding GET and is sent as `If-Match`. */
export async function refineTeachingWork(
  workId: string,
  body: TeachingWorkRefineRequest,
  etag: string,
) {
  return apiRequest<TeachingWork>(`/api/v1/teaching/works/${workId}`, {
    method: "PATCH",
    body,
    headers: {
      "If-Match": etag,
      "Idempotency-Key": crypto.randomUUID(),
    },
  });
}
