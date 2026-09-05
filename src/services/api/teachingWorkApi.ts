import { apiRequest } from "./client";
import type { components } from "./generated/aieos-v1";
import type {
  TeachingWork,
  TeachingWorkArtifactsResponse,
  TeachingWorkCreateRequest,
  TeachingWorkGenerateResponse,
  TeachingWorkList,
  TeachingWorkPrepareResponse,
  TeachingWorkRefineRequest,
} from "./generated/teachingTypes";

export type RemediationTeachingWorkCreateRequest =
  components["schemas"]["RemediationTeachingWorkCreateRequest"];

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

/**
 * Create remediation TeachingWork from a RECORDED ClassroomAssessment
 * (ADR-AIEOS-056). Server derives intent_type=remediate_class and ClassRef.
 *
 * Pass a stable `idempotencyKey` for one logical teacher submission/retry.
 */
export async function createRemediationTeachingWorkFromAssessment(
  body: RemediationTeachingWorkCreateRequest,
  idempotencyKey: string,
) {
  return apiRequest<TeachingWork>(
    "/api/v1/teaching/works/from-classroom-assessment",
    {
      method: "POST",
      body,
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
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

/**
 * Ask AIEOS to create the first preparation draft for this Work (DEV03).
 * Capability / model / prompt selection is server-side — no body.
 * Prefer {@link prepareTeachingWork} for the DEV04 Preparation Kit UX.
 */
export async function generateTeachingWork(
  workId: string,
  etag: string,
  idempotencyKey?: string,
) {
  return apiRequest<TeachingWorkGenerateResponse>(
    `/api/v1/teaching/works/${workId}/actions/generate`,
    {
      method: "POST",
      headers: {
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey ?? crypto.randomUUID(),
      },
    },
  );
}

/**
 * Ask AIEOS to create the six-artifact Preparation Kit for this Work (DEV04).
 * Capability / model / prompt selection is server-side — no body.
 * Pass a stable `idempotencyKey` for one logical teacher action.
 */
export async function prepareTeachingWork(
  workId: string,
  etag: string,
  idempotencyKey?: string,
) {
  return apiRequest<TeachingWorkPrepareResponse>(
    `/api/v1/teaching/works/${workId}/actions/prepare`,
    {
      method: "POST",
      headers: {
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey ?? crypto.randomUUID(),
      },
    },
  );
}

/** Teacher-facing artifact summaries linked to a Work (includes educational_quality). */
export async function listTeachingWorkArtifacts(workId: string) {
  return apiRequest<TeachingWorkArtifactsResponse>(
    `/api/v1/teaching/works/${workId}/artifacts`,
    { method: "GET" },
  );
}
