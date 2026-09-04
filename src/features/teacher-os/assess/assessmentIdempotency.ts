/**
 * Canonical Idempotency-Key retention for ClassroomAssessment mutations.
 * Material must match Backend fingerprint fields exactly.
 */

export {
  clearIdempotencyAssociation,
  parseRevisionFromEtag,
  resolveRevisionSensitiveIdempotencyKey,
  retainOrMintIdempotencyKey,
  type RevisionSensitiveKeyResult,
} from "../teach/executionIdempotency";

export function recordAssessmentMaterial(input: {
  classRef: string;
  contentId: string;
  contentVersionId: string;
  classResultLevel: string;
  classResultNote: string | null;
  executionId: string | null;
  workId: string | null;
  assignmentId: string | null;
}): string {
  return JSON.stringify({
    class_ref: input.classRef,
    content_id: input.contentId,
    content_version_id: input.contentVersionId,
    class_result_level: input.classResultLevel,
    class_result_note: input.classResultNote,
    execution_id: input.executionId,
    work_id: input.workId,
    assignment_id: input.assignmentId,
  });
}

export function correctAssessmentMaterial(input: {
  assessmentId: string;
  expectedAggregateRevision: number;
  classResultLevel: string;
  classResultNote: string | null;
}): string {
  return JSON.stringify({
    assessment_id: input.assessmentId,
    expected_aggregate_revision: input.expectedAggregateRevision,
    class_result_level: input.classResultLevel,
    class_result_note: input.classResultNote,
  });
}

export function voidAssessmentMaterial(input: {
  assessmentId: string;
  expectedAggregateRevision: number;
}): string {
  return JSON.stringify({
    assessment_id: input.assessmentId,
    expected_aggregate_revision: input.expectedAggregateRevision,
    action: "void",
  });
}
