import type { ClassroomAssessmentResponse } from "@/services/api/classroomAssessmentsApi";
import {
  formatAssessmentInstant,
  formatAssessmentLifecycleLabel,
  formatClassResultLevelLabel,
  isAssessmentRecorded,
  isAssessmentVoided,
} from "../assess/assessmentPresentation";

export const GOAL_TEXT_MAX = 2000;
export const DEFAULT_IMPROVE_LOCALE = "en-IN";

export function improveHrefForAssessment(assessmentId: string): string {
  return `/teacher-os/improve?assessment_id=${encodeURIComponent(assessmentId)}`;
}

export function isEligibleForImprove(
  assessment: Pick<ClassroomAssessmentResponse, "lifecycle_state">,
): boolean {
  return isAssessmentRecorded(assessment);
}

export function formatImproveIntentLabel(intentType: string): string {
  if (intentType === "remediate_class") return "Remediate class";
  if (intentType === "prepare_tomorrow") return "Prepare tomorrow";
  return intentType;
}

/** Read-only Assessment facts for Improve display — never remediation POST inputs. */
export function assessmentContextRows(
  assessment: ClassroomAssessmentResponse,
): Array<{ label: string; value: string; code?: boolean }> {
  const rows: Array<{ label: string; value: string; code?: boolean }> = [
    {
      label: "Lifecycle",
      value: `${formatAssessmentLifecycleLabel(assessment.lifecycle_state)} (${assessment.lifecycle_state})`,
    },
    {
      label: "ClassRef",
      value: assessment.class_ref,
      code: true,
    },
    {
      label: "Class result",
      value: `${formatClassResultLevelLabel(assessment.class_result_level)} (${assessment.class_result_level})`,
    },
    {
      label: "Class result note",
      value: assessment.class_result_note ?? "—",
    },
    {
      label: "Content",
      value: assessment.content_id,
      code: true,
    },
    {
      label: "Content version",
      value: assessment.content_version_id,
      code: true,
    },
    {
      label: "Recorded",
      value: formatAssessmentInstant(assessment.recorded_at),
    },
    {
      label: "Assessment revision",
      value: String(assessment.aggregate_revision),
    },
  ];
  if (assessment.work_id) {
    rows.push({
      label: "Source Work",
      value: assessment.work_id,
      code: true,
    });
  }
  if (assessment.execution_id) {
    rows.push({
      label: "Source Execution",
      value: assessment.execution_id,
      code: true,
    });
  }
  if (assessment.assignment_id) {
    rows.push({
      label: "Source Assignment",
      value: assessment.assignment_id,
      code: true,
    });
  }
  return rows;
}

export function voidedImproveMessage(
  assessment: Pick<ClassroomAssessmentResponse, "lifecycle_state">,
): string | null {
  if (!isAssessmentVoided(assessment)) return null;
  return "This ClassroomAssessment is VOIDED. It is not eligible for a new remediation preparation.";
}
