/**
 * Canonical Idempotency-Key retention for Assessment-origin remediation create.
 * Material must match Backend fingerprint fields exactly (ADR-AIEOS-056).
 */

export {
  clearIdempotencyAssociation,
  retainOrMintIdempotencyKey,
} from "../teach/executionIdempotency";

export function remediationCreateMaterial(input: {
  assessmentId: string;
  expectedAssessmentAggregateRevision: number;
  goalText: string;
  targetDate: string;
  locale: string;
  subject: string | null;
  topic: string | null;
}): string {
  return JSON.stringify({
    assessment_id: input.assessmentId,
    expected_assessment_aggregate_revision:
      input.expectedAssessmentAggregateRevision,
    goal_text: input.goalText,
    target_date: input.targetDate,
    locale: input.locale,
    subject: input.subject,
    topic: input.topic,
  });
}
