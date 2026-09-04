import { describe, expect, it } from "vitest";
import {
  ASSESSABLE_ARTIFACT_KINDS,
  CLASS_RESULT_LEVEL_VALUES,
  CLASS_RESULT_NOTE_MAX,
  eligibleAssessmentBindings,
  isAssessableArtifactKind,
  NON_ASSESSABLE_ARTIFACT_KINDS,
} from "./assessmentPresentation";
import {
  correctAssessmentMaterial,
  recordAssessmentMaterial,
  retainOrMintIdempotencyKey,
} from "./assessmentIdempotency";

describe("TOS-DEV08-I03 assessment presentation", () => {
  it("exposes exact class result wire values only", () => {
    expect(CLASS_RESULT_LEVEL_VALUES).toEqual([
      "DEMONSTRATED",
      "MIXED",
      "NOT_YET_DEMONSTRATED",
    ]);
    expect(CLASS_RESULT_NOTE_MAX).toBe(4096);
  });

  it("filters only quiz/worksheet/homework bindings", () => {
    expect(ASSESSABLE_ARTIFACT_KINDS).toEqual([
      "quiz",
      "worksheet",
      "homework",
    ]);
    for (const kind of NON_ASSESSABLE_ARTIFACT_KINDS) {
      expect(isAssessableArtifactKind(kind)).toBe(false);
    }
    const eligible = eligibleAssessmentBindings([
      {
        content_id: "a",
        content_version_id: "b",
        artifact_kind: "quiz",
      },
      {
        content_id: "c",
        content_version_id: "d",
        artifact_kind: "lesson_plan",
      },
      {
        content_id: "e",
        content_version_id: "f",
        artifact_kind: "homework",
      },
    ]);
    expect(eligible.map((item) => item.artifact_kind)).toEqual([
      "quiz",
      "homework",
    ]);
  });
});

describe("TOS-DEV08-I03 assessment idempotency", () => {
  it("reuses key for unchanged RECORD material", () => {
    const keyRef = { current: null as string | null };
    const materialRef = { current: null as string | null };
    const material = recordAssessmentMaterial({
      classRef: "class-5a",
      contentId: "c1",
      contentVersionId: "v1",
      classResultLevel: "MIXED",
      classResultNote: null,
      executionId: "e1",
      workId: "w1",
      assignmentId: null,
    });
    const first = retainOrMintIdempotencyKey(
      material,
      keyRef,
      materialRef,
      () => "key-1",
    );
    const second = retainOrMintIdempotencyKey(
      material,
      keyRef,
      materialRef,
      () => "key-2",
    );
    expect(first).toBe("key-1");
    expect(second).toBe("key-1");
  });

  it("mints a new key when RECORD material changes", () => {
    const keyRef = { current: null as string | null };
    const materialRef = { current: null as string | null };
    const firstMaterial = recordAssessmentMaterial({
      classRef: "class-5a",
      contentId: "c1",
      contentVersionId: "v1",
      classResultLevel: "MIXED",
      classResultNote: null,
      executionId: "e1",
      workId: "w1",
      assignmentId: null,
    });
    retainOrMintIdempotencyKey(
      firstMaterial,
      keyRef,
      materialRef,
      () => "key-1",
    );
    const secondMaterial = correctAssessmentMaterial({
      assessmentId: "a1",
      expectedAggregateRevision: 0,
      classResultLevel: "DEMONSTRATED",
      classResultNote: "note",
    });
    // Use record material change path
    const changed = recordAssessmentMaterial({
      classRef: "class-5a",
      contentId: "c1",
      contentVersionId: "v1",
      classResultLevel: "DEMONSTRATED",
      classResultNote: null,
      executionId: "e1",
      workId: "w1",
      assignmentId: null,
    });
    const next = retainOrMintIdempotencyKey(
      changed,
      keyRef,
      materialRef,
      () => "key-2",
    );
    expect(next).toBe("key-2");
    expect(secondMaterial).toContain("assessment_id");
  });
});
