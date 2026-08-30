import type { WorkArtifactItem } from "@/services/api/generated/teachingTypes";

/** Canonical technical kinds from ADR-AIEOS-052 / Backend DEV04. */
export const PREPARATION_ARTIFACT_KINDS = [
  "lesson_plan",
  "worksheet",
  "quiz",
  "homework",
  "answer_key",
  "teacher_notes",
] as const;

export type PreparationArtifactKind =
  (typeof PREPARATION_ARTIFACT_KINDS)[number];

const TEACHER_LABELS: Record<PreparationArtifactKind, string> = {
  lesson_plan: "Lesson Plan",
  worksheet: "Worksheet",
  quiz: "Quick Quiz",
  homework: "Homework",
  answer_key: "Answer Key",
  teacher_notes: "Teacher Notes",
};

export function preparationArtifactLabel(
  kind: string | null | undefined,
): string {
  if (kind && kind in TEACHER_LABELS) {
    return TEACHER_LABELS[kind as PreparationArtifactKind];
  }
  return kind?.trim() || "Artifact";
}

export function isPreparationArtifactKind(
  value: string | null | undefined,
): value is PreparationArtifactKind {
  return (
    typeof value === "string" &&
    (PREPARATION_ARTIFACT_KINDS as readonly string[]).includes(value)
  );
}

/**
 * True when the artifacts list contains the exact six canonical kinds
 * (a DEV04 preparation kit). Historical DEV03 single-worksheet rows do not.
 */
export function isCompletePreparationKit(
  items: WorkArtifactItem[],
): boolean {
  const kinds = new Set(
    items
      .map((item) => item.artifact_kind)
      .filter(isPreparationArtifactKind),
  );
  return PREPARATION_ARTIFACT_KINDS.every((kind) => kinds.has(kind));
}

/** Order kit items in canonical ADR order; unknown kinds sort after. */
export function orderPreparationArtifacts(
  items: WorkArtifactItem[],
): WorkArtifactItem[] {
  const rank = new Map(
    PREPARATION_ARTIFACT_KINDS.map((kind, index) => [kind, index]),
  );
  return [...items].sort((a, b) => {
    const aRank = rank.get(a.artifact_kind as PreparationArtifactKind) ?? 99;
    const bRank = rank.get(b.artifact_kind as PreparationArtifactKind) ?? 99;
    if (aRank !== bRank) return aRank - bRank;
    return a.title.localeCompare(b.title);
  });
}

export function reviewPathForArtifact(item: WorkArtifactItem): string {
  return `/teacher-os/review/${item.content_id}/versions/${item.version_id}`;
}
