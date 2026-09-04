import type { ClassroomAssessmentResponse } from "@/services/api/classroomAssessmentsApi";
import type { TeachingExecutionContentBindingResponse } from "@/services/api/teachingExecutionsApi";

/** Exact wire values for class-level ClassroomAssessment results (ADR-AIEOS-055). */
export const CLASS_RESULT_LEVELS = [
  {
    value: "DEMONSTRATED",
    label: "Demonstrated",
    description:
      "As a class, learners showed the intended outcome for this artifact.",
  },
  {
    value: "MIXED",
    label: "Mixed",
    description:
      "Class progress was uneven — some demonstrated the outcome, some did not.",
  },
  {
    value: "NOT_YET_DEMONSTRATED",
    label: "Not yet demonstrated",
    description:
      "As a class, the intended outcome was not yet demonstrated for this artifact.",
  },
] as const;

export type ClassResultLevel = (typeof CLASS_RESULT_LEVELS)[number]["value"];

export const CLASS_RESULT_LEVEL_VALUES: readonly ClassResultLevel[] =
  CLASS_RESULT_LEVELS.map((item) => item.value);

/** Eligible TeachingExecution binding kinds for ClassroomAssessment (Case A). */
export const ASSESSABLE_ARTIFACT_KINDS = [
  "quiz",
  "worksheet",
  "homework",
] as const;

export type AssessableArtifactKind =
  (typeof ASSESSABLE_ARTIFACT_KINDS)[number];

const ASSESSABLE_KIND_SET = new Set<string>(ASSESSABLE_ARTIFACT_KINDS);

/** Teacher-facing materials that must never be offered for assessment. */
export const NON_ASSESSABLE_ARTIFACT_KINDS = [
  "lesson_plan",
  "answer_key",
  "teacher_notes",
] as const;

export const CLASS_RESULT_NOTE_MAX = 4096;

export const CLASS_RESULT_NOTE_PRIVACY_REMINDER =
  "Keep this note class-level. Do not include learner names or other learner-identifying information.";

export function isAssessableArtifactKind(
  kind: string | null | undefined,
): kind is AssessableArtifactKind {
  if (!kind) return false;
  return ASSESSABLE_KIND_SET.has(kind);
}

export function eligibleAssessmentBindings(
  bindings: TeachingExecutionContentBindingResponse[] | undefined,
): TeachingExecutionContentBindingResponse[] {
  if (!bindings) return [];
  return bindings.filter((binding) =>
    isAssessableArtifactKind(binding.artifact_kind),
  );
}

export function isClassResultLevel(
  value: string | null | undefined,
): value is ClassResultLevel {
  return (
    value === "DEMONSTRATED" ||
    value === "MIXED" ||
    value === "NOT_YET_DEMONSTRATED"
  );
}

export function formatClassResultLevelLabel(value: string): string {
  const found = CLASS_RESULT_LEVELS.find((item) => item.value === value);
  return found?.label ?? value;
}

export function formatAssessmentLifecycleLabel(state: string): string {
  if (state === "RECORDED") return "Recorded";
  if (state === "VOIDED") return "Voided";
  return state;
}

export function isAssessmentRecorded(
  assessment: Pick<ClassroomAssessmentResponse, "lifecycle_state">,
): boolean {
  return assessment.lifecycle_state === "RECORDED";
}

export function isAssessmentVoided(
  assessment: Pick<ClassroomAssessmentResponse, "lifecycle_state">,
): boolean {
  return assessment.lifecycle_state === "VOIDED";
}

export function formatAssessmentInstant(
  iso: string | null | undefined,
): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Opaque revision ETag encoding used by AIEOS (`"r{n}"`, quotes included). */
export function assessmentRevisionEtag(revision: number): string {
  return `"r${revision}"`;
}

export function assessHrefForExecution(executionId: string): string {
  return `/teacher-os/assess?execution_id=${encodeURIComponent(executionId)}`;
}

export function assessHrefForAssessment(assessmentId: string): string {
  return `/teacher-os/assess?assessment_id=${encodeURIComponent(assessmentId)}`;
}
