import { apiRequest } from "./client";
import type { components } from "./generated/aieos-v1";

export type ClassroomAssessmentCorrectRequest =
  components["schemas"]["ClassroomAssessmentCorrectRequest"];
export type ClassroomAssessmentListResponse =
  components["schemas"]["ClassroomAssessmentListResponse"];
export type ClassroomAssessmentRecordRequest =
  components["schemas"]["ClassroomAssessmentRecordRequest"];
export type ClassroomAssessmentResponse =
  components["schemas"]["ClassroomAssessmentResponse"];

export async function listClassroomAssessments(filters?: {
  classRef?: string | null;
  workId?: string | null;
  executionId?: string | null;
  assignmentId?: string | null;
  lifecycleState?: string | null;
  limit?: number | null;
}) {
  return apiRequest<ClassroomAssessmentListResponse>(
    "/api/v1/assessment/classroom-assessments",
    {
      method: "GET",
      query: {
        class_ref: filters?.classRef,
        work_id: filters?.workId,
        execution_id: filters?.executionId,
        assignment_id: filters?.assignmentId,
        lifecycle_state: filters?.lifecycleState,
        limit: filters?.limit,
      },
    },
  );
}

export async function getClassroomAssessment(assessmentId: string) {
  return apiRequest<ClassroomAssessmentResponse>(
    `/api/v1/assessment/classroom-assessments/${assessmentId}`,
    { method: "GET" },
  );
}

export async function recordClassroomAssessment(
  body: ClassroomAssessmentRecordRequest,
  idempotencyKey: string,
) {
  return apiRequest<ClassroomAssessmentResponse>(
    "/api/v1/assessment/classroom-assessments",
    {
      method: "POST",
      body,
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}

export async function correctClassroomAssessment(
  assessmentId: string,
  body: ClassroomAssessmentCorrectRequest,
  etag: string,
  idempotencyKey: string,
) {
  return apiRequest<ClassroomAssessmentResponse>(
    `/api/v1/assessment/classroom-assessments/${assessmentId}/actions/correct`,
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

export async function voidClassroomAssessment(
  assessmentId: string,
  etag: string,
  idempotencyKey: string,
) {
  return apiRequest<ClassroomAssessmentResponse>(
    `/api/v1/assessment/classroom-assessments/${assessmentId}/actions/void`,
    {
      method: "POST",
      headers: {
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}
