import { describe, expect, it } from "vitest";
import {
  canAssignPublishedVersion,
  isLearnerAssignableArtifact,
} from "./learnerAssignable";

describe("learner-assignable artifact policy", () => {
  it.each(["worksheet", "quiz", "homework"] as const)(
    "%s is learner-assignable",
    (kind) => {
      expect(isLearnerAssignableArtifact(kind)).toBe(true);
    },
  );

  it.each([
    "lesson_plan",
    "answer_key",
    "teacher_notes",
    "unknown.kind",
    "",
    null,
    undefined,
  ] as const)("%s is not learner-assignable", (kind) => {
    expect(isLearnerAssignableArtifact(kind as string | null | undefined)).toBe(
      false,
    );
  });

  it("requires exact published pointer match", () => {
    expect(
      canAssignPublishedVersion({
        contentType: "worksheet",
        publishedVersionId: "v1",
        viewedVersionId: "v1",
      }),
    ).toBe(true);
    expect(
      canAssignPublishedVersion({
        contentType: "worksheet",
        publishedVersionId: null,
        viewedVersionId: "v1",
      }),
    ).toBe(false);
    expect(
      canAssignPublishedVersion({
        contentType: "worksheet",
        publishedVersionId: "v2",
        viewedVersionId: "v1",
      }),
    ).toBe(false);
    expect(
      canAssignPublishedVersion({
        contentType: "lesson_plan",
        publishedVersionId: "v1",
        viewedVersionId: "v1",
      }),
    ).toBe(false);
  });
});
