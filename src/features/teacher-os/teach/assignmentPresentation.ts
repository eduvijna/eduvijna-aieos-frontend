import type { TeachingAssignmentResponse } from "@/services/api/teachingAssignmentsApi";

const WORK_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatAssignmentInstant(
  iso: string | null | undefined,
): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function artifactLinkForAssignment(
  assignment: Pick<
    TeachingAssignmentResponse,
    "source_work_id" | "content_id" | "content_version_id"
  >,
): string | null {
  const workId = assignment.source_work_id;
  if (!workId || !WORK_ID_RE.test(workId)) return null;
  return `/teacher-os/work/${workId}/artifacts/${assignment.content_id}/versions/${assignment.content_version_id}`;
}

export function isActiveAssignment(
  assignment: Pick<TeachingAssignmentResponse, "lifecycle_state">,
): boolean {
  return assignment.lifecycle_state === "ACTIVE";
}
