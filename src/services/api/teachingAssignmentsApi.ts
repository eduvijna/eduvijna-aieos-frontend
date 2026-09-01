import { apiRequest } from "./client";
import type { components } from "./generated/aieos-v1";

export type SchoolContextClassItem =
  components["schemas"]["SchoolContextClassItemResponse"];
export type SchoolContextClassesResponse =
  components["schemas"]["SchoolContextClassesResponse"];
export type TeachingAssignmentCreateRequest =
  components["schemas"]["TeachingAssignmentCreateRequest"];
export type TeachingAssignmentDueUpdateRequest =
  components["schemas"]["TeachingAssignmentDueUpdateRequest"];
export type TeachingAssignmentResponse =
  components["schemas"]["TeachingAssignmentResponse"];
export type TeachingAssignmentListResponse =
  components["schemas"]["TeachingAssignmentListResponse"];

export async function listAssignableClasses() {
  return apiRequest<SchoolContextClassesResponse>(
    "/api/v1/teacher-os/school-context/classes",
    { method: "GET" },
  );
}

export async function createTeachingAssignment(
  body: TeachingAssignmentCreateRequest,
  idempotencyKey: string,
) {
  return apiRequest<TeachingAssignmentResponse>(
    "/api/v1/teaching/assignments",
    {
      method: "POST",
      body,
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}

export async function listTeachingAssignments(options?: {
  lifecycleState?: string | null;
  limit?: number | null;
}) {
  return apiRequest<TeachingAssignmentListResponse>(
    "/api/v1/teaching/assignments",
    {
      method: "GET",
      query: {
        lifecycle_state: options?.lifecycleState,
        limit: options?.limit,
      },
    },
  );
}

export async function getTeachingAssignment(assignmentId: string) {
  return apiRequest<TeachingAssignmentResponse>(
    `/api/v1/teaching/assignments/${assignmentId}`,
    { method: "GET" },
  );
}

export async function updateTeachingAssignmentDue(
  assignmentId: string,
  body: TeachingAssignmentDueUpdateRequest,
  etag: string,
  idempotencyKey: string,
) {
  return apiRequest<TeachingAssignmentResponse>(
    `/api/v1/teaching/assignments/${assignmentId}`,
    {
      method: "PATCH",
      body,
      headers: {
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}

export async function closeTeachingAssignment(
  assignmentId: string,
  etag: string,
  idempotencyKey: string,
) {
  return apiRequest<TeachingAssignmentResponse>(
    `/api/v1/teaching/assignments/${assignmentId}/actions/close`,
    {
      method: "POST",
      headers: {
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}

export async function cancelTeachingAssignment(
  assignmentId: string,
  etag: string,
  idempotencyKey: string,
) {
  return apiRequest<TeachingAssignmentResponse>(
    `/api/v1/teaching/assignments/${assignmentId}/actions/cancel`,
    {
      method: "POST",
      headers: {
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}
