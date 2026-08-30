import { describe, expect, it } from "vitest";
import {
  artifactLifecycleActions,
  artifactViewPath,
  formatArtifactLifecycleSummary,
  reviewPathForArtifact,
  safeWorkReturnPath,
  summarizeArtifactLifecycle,
} from "./lifecycle";
import { stewardshipStatusLabel } from "./stewardshipLabel";
import {
  samplePreparationKitArtifacts,
  sampleWorkArtifact,
  WORK_ID,
} from "@/test/test-utils";

describe("TOS-DEV05 lifecycle helpers", () => {
  it("IN_REVIEW → Review only; no Publish", () => {
    const actions = artifactLifecycleActions("IN_REVIEW");
    expect(actions.label).toBe("In Review");
    expect(actions.showReview).toBe(true);
    expect(actions.showView).toBe(false);
    expect(actions.showPublish).toBe(false);
  });

  it("APPROVED → View + Publish", () => {
    const actions = artifactLifecycleActions("APPROVED");
    expect(actions.label).toBe("Approved");
    expect(actions.showReview).toBe(false);
    expect(actions.showView).toBe(true);
    expect(actions.showPublish).toBe(true);
  });

  it("PUBLISHED → View; no Publish", () => {
    const actions = artifactLifecycleActions("PUBLISHED");
    expect(actions.label).toBe("Published");
    expect(actions.showReview).toBe(false);
    expect(actions.showView).toBe(true);
    expect(actions.showPublish).toBe(false);
  });

  it("unknown / non-publishable states fail closed", () => {
    for (const state of [
      "CHANGES_REQUESTED",
      "REJECTED",
      "GENERATED",
      "DRAFT",
      "ARCHIVED",
      "WEIRD_FUTURE_STATE",
    ]) {
      const actions = artifactLifecycleActions(state);
      expect(actions.showPublish).toBe(false);
      expect(actions.showReview).toBe(false);
      expect(actions.label).toBe(stewardshipStatusLabel(state));
    }
  });

  it("builds review path with bounded fromWork context", () => {
    expect(reviewPathForArtifact(sampleWorkArtifact)).toBe(
      `/teacher-os/review/${sampleWorkArtifact.content_id}/versions/${sampleWorkArtifact.version_id}`,
    );
    expect(reviewPathForArtifact(sampleWorkArtifact, WORK_ID)).toBe(
      `/teacher-os/review/${sampleWorkArtifact.content_id}/versions/${sampleWorkArtifact.version_id}?fromWork=${WORK_ID}`,
    );
    expect(
      reviewPathForArtifact(sampleWorkArtifact, "https://evil.example/x"),
    ).toBe(
      `/teacher-os/review/${sampleWorkArtifact.content_id}/versions/${sampleWorkArtifact.version_id}`,
    );
  });

  it("builds durable artifact view path", () => {
    expect(artifactViewPath(WORK_ID, sampleWorkArtifact)).toBe(
      `/teacher-os/work/${WORK_ID}/artifacts/${sampleWorkArtifact.content_id}/versions/${sampleWorkArtifact.version_id}`,
    );
  });

  it("accepts only Work UUID return targets", () => {
    expect(safeWorkReturnPath(WORK_ID)).toBe(`/teacher-os/work/${WORK_ID}`);
    expect(safeWorkReturnPath("https://evil.example")).toBeNull();
    expect(safeWorkReturnPath("/teacher-os/review")).toBeNull();
    expect(safeWorkReturnPath(null)).toBeNull();
  });

  it("summarizes kit lifecycle as a display projection", () => {
    const items = samplePreparationKitArtifacts().items.map((item, index) => {
      if (index < 3) return { ...item, stewardship_state: "IN_REVIEW" };
      if (index < 5) return { ...item, stewardship_state: "APPROVED" };
      return { ...item, stewardship_state: "PUBLISHED" };
    });
    const summary = summarizeArtifactLifecycle(items);
    expect(summary).toEqual({
      total: 6,
      inReview: 3,
      approved: 2,
      published: 1,
      other: 0,
    });
    expect(formatArtifactLifecycleSummary(summary)).toBe(
      "6 artifacts · 3 in review · 2 approved · 1 published",
    );
  });

  it("keeps historical DEV03 single artifact summaries safe", () => {
    const summary = summarizeArtifactLifecycle([sampleWorkArtifact]);
    expect(summary.total).toBe(1);
    expect(formatArtifactLifecycleSummary(summary)).toBe(
      "1 artifact · 1 in review",
    );
  });
});
