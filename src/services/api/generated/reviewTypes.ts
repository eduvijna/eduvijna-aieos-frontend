/**
 * Focused Review Queue / Review Decision types for TOS-DEV01 Lane A.
 * Prefer regenerating full OpenAPI types via `pnpm generate:api-types` when practical.
 * Full generated output (when present) lives alongside this module as `aieos-v1.ts`.
 */

export type TeacherReviewQueueItem = {
  content_id: string;
  version_id: string;
  version_number: number;
  content_type: string;
  title: string;
  description: string;
  locale: string;
  artifact_status: string;
  origin: string;
  aggregate_revision: number;
  submitted_at: string;
  version_created_at: string;
  published_version_id: string | null;
};

export type TeacherReviewQueueList = {
  items: TeacherReviewQueueItem[];
  next_cursor: string | null;
};

export type TeacherReviewQueueDetail = TeacherReviewQueueItem & {
  schema_id: string;
  schema_version: number;
  payload: Record<string, unknown>;
  payload_sha256: string;
};

export type ReviewDecisionRequest = {
  comment?: string | null;
  reason_code?: string | null;
};

export type ReviewDecisionResponse = {
  review_decision_id: string;
  content_id: string;
  version_id: string;
  decision: string;
  reason_code: string | null;
  comment: string | null;
  decided_at: string;
  stewardship_state: string;
  aggregate_revision: number;
};

export type ReviewAction = "approve" | "request-changes" | "reject";
