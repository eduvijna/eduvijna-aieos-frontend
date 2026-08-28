/**
 * Focused Teaching Work / Today's Mission / generate types for TOS-DEV03 Lane A.
 * Prefer regenerating full OpenAPI types via `pnpm generate:api-types` when practical.
 * Full generated output (when present) lives alongside this module as `aieos-v1.ts`.
 */

/** Teaching Intent is a request that enters Work creation. It is never a durable aggregate. */
export type TeachingIntentType = "prepare_tomorrow";

export type TeachingWork = {
  work_id: string;
  intent_type: string;
  goal_text: string;
  class_label: string | null;
  subject: string | null;
  topic: string | null;
  /** Calendar date as YYYY-MM-DD. */
  target_date: string;
  locale: string;
  aggregate_revision: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type TeachingWorkList = {
  items: TeachingWork[];
  has_more: boolean;
};

export type TeachingWorkCreateRequest = {
  intent_type: TeachingIntentType;
  goal_text: string;
  target_date: string;
  locale: string;
  class_label?: string | null;
  subject?: string | null;
  topic?: string | null;
};

/**
 * PATCH body with true partial semantics: an omitted key is left untouched and an
 * explicit null clears a nullable field. `goal_text`, `target_date`, and `locale`
 * are non-nullable server-side, so never send null for them.
 */
export type TeachingWorkRefineRequest = {
  goal_text?: string;
  target_date?: string;
  locale?: string;
  class_label?: string | null;
  subject?: string | null;
  topic?: string | null;
};

export type MissionHeroActionKind =
  | "review"
  | "continue_work"
  | "prepare_tomorrow";

export type MissionReviewProjection = {
  pending_count: number;
};

export type MissionContinueWork = {
  work_id: string;
  intent_type: string;
  goal_text: string;
  class_label: string | null;
  subject: string | null;
  topic: string | null;
  target_date: string;
  aggregate_revision: number;
  updated_at: string;
};

export type MissionPreparationProjection = {
  active_work_count: number;
  continue_work: MissionContinueWork | null;
};

export type MissionHeroAction = {
  kind: MissionHeroActionKind;
  work_id: string | null;
};

/** Derived read projection. No mission row exists behind this response. */
export type TeacherOsMission = {
  mission_date: string;
  review: MissionReviewProjection;
  preparation: MissionPreparationProjection;
  hero_action: MissionHeroAction;
};

/** One educational-quality check returned by the server (never invented client-side). */
export type EducationalQualityCheck = {
  code: string;
  passed: boolean;
  explanation: string;
};

export type EducationalQuality = {
  status: string;
  checks: EducationalQualityCheck[];
};

/** Artifact summary on a successful generate response. */
export type GeneratedArtifact = {
  content_id: string;
  version_id: string;
  content_type: string;
  title: string;
  stewardship_state: string;
  aggregate_revision: number;
};

export type TeachingWorkGenerateResponse = {
  work_id: string;
  generation_run_id: string;
  artifact: GeneratedArtifact;
  educational_quality: EducationalQuality;
};

/** Teacher-facing artifact row from GET …/artifacts. */
export type WorkArtifactItem = {
  content_id: string;
  version_id: string;
  content_type: string;
  title: string;
  origin: string;
  stewardship_state: string;
  aggregate_revision: number;
  educational_quality: EducationalQuality | null;
};

export type TeachingWorkArtifactsResponse = {
  work_id: string;
  items: WorkArtifactItem[];
};
