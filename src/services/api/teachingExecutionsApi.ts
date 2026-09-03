import { apiRequest } from "./client";
import type { components } from "./generated/aieos-v1";

export type TeacherOsTeachContextResponse =
  components["schemas"]["TeacherOsTeachContextResponse"];
export type TeachingExecutionContentBindingRequest =
  components["schemas"]["TeachingExecutionContentBindingRequest"];
export type TeachingExecutionContentBindingResponse =
  components["schemas"]["TeachingExecutionContentBindingResponse"];
export type TeachingExecutionListResponse =
  components["schemas"]["TeachingExecutionListResponse"];
export type TeachingExecutionObservationCorrectRequest =
  components["schemas"]["TeachingExecutionObservationCorrectRequest"];
export type TeachingExecutionObservationCreateRequest =
  components["schemas"]["TeachingExecutionObservationCreateRequest"];
export type TeachingExecutionObservationResponse =
  components["schemas"]["TeachingExecutionObservationResponse"];
export type TeachingExecutionResponse =
  components["schemas"]["TeachingExecutionResponse"];
export type TeachingExecutionStartRequest =
  components["schemas"]["TeachingExecutionStartRequest"];

export async function getTeachContext(workId: string, classRef: string) {
  return apiRequest<TeacherOsTeachContextResponse>(
    "/api/v1/teacher-os/teach/context",
    {
      method: "GET",
      query: {
        work_id: workId,
        class_ref: classRef,
      },
    },
  );
}

export async function startTeachingExecution(
  body: TeachingExecutionStartRequest,
  idempotencyKey: string,
) {
  return apiRequest<TeachingExecutionResponse>("/api/v1/teaching/executions", {
    method: "POST",
    body,
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
  });
}

export async function listTeachingExecutions(filters?: {
  workId?: string | null;
  classRef?: string | null;
  lifecycleState?: string | null;
  limit?: number | null;
}) {
  return apiRequest<TeachingExecutionListResponse>(
    "/api/v1/teaching/executions",
    {
      method: "GET",
      query: {
        work_id: filters?.workId,
        class_ref: filters?.classRef,
        lifecycle_state: filters?.lifecycleState,
        limit: filters?.limit,
      },
    },
  );
}

export async function getTeachingExecution(executionId: string) {
  return apiRequest<TeachingExecutionResponse>(
    `/api/v1/teaching/executions/${executionId}`,
    { method: "GET" },
  );
}

export async function createTeachingExecutionObservation(
  executionId: string,
  body: TeachingExecutionObservationCreateRequest,
  idempotencyKey: string,
) {
  return apiRequest<TeachingExecutionObservationResponse>(
    `/api/v1/teaching/executions/${executionId}/observations`,
    {
      method: "POST",
      body,
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}

export async function correctTeachingExecutionObservation(
  executionId: string,
  observationId: string,
  body: TeachingExecutionObservationCorrectRequest,
  etag: string,
  idempotencyKey: string,
) {
  return apiRequest<TeachingExecutionObservationResponse>(
    `/api/v1/teaching/executions/${executionId}/observations/${observationId}`,
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

export async function completeTeachingExecution(
  executionId: string,
  etag: string,
  idempotencyKey: string,
) {
  return apiRequest<TeachingExecutionResponse>(
    `/api/v1/teaching/executions/${executionId}/actions/complete`,
    {
      method: "POST",
      headers: {
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}

export async function cancelTeachingExecution(
  executionId: string,
  etag: string,
  idempotencyKey: string,
) {
  return apiRequest<TeachingExecutionResponse>(
    `/api/v1/teaching/executions/${executionId}/actions/cancel`,
    {
      method: "POST",
      headers: {
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}
