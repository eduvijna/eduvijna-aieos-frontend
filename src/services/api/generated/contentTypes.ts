/**
 * Focused Generic Content types used by Teacher OS artifact view / publish.
 * Prefer regenerating full OpenAPI types via `pnpm generate:api-types` when practical.
 */

export type ContentResponse = {
  content_id: string;
  content_type: string;
  title: string;
  description: string;
  locale: string;
  stewardship_state: string;
  current_version_id: string | null;
  published_version_id: string | null;
  aggregate_revision: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ContentVersionResponse = {
  content_id: string;
  version_id: string;
  version_number: number;
  schema_id: string;
  schema_version: number;
  payload: Record<string, unknown>;
  payload_sha256: string;
  origin: string;
  parent_version_id: string | null;
  created_at: string;
};

export type ContentPublishRequest = {
  version_id: string;
};

export type PublicationResponse = {
  publication_id: string;
  content_id: string;
  version_id: string;
  published_version_id: string;
  published_at: string;
  approval_decision_id: string;
  aggregate_revision: number;
};
