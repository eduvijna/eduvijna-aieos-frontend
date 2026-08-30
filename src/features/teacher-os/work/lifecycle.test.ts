import { describe, expect, it } from "vitest";
import {
  formatArtifactLifecycleSummary,
  resolveArtifactLifecycle,
  resolveContentVersionLifecycle,
  reviewPathForArtifact,
  artifactViewPath,
  safeWorkReturnPath,
  summarizeResolvedLifecycle,
} from "./lifecycle";
import {
  samplePreparationKitArtifacts,
  sampleWorkArtifact,
  WORK_ID,
} from "@/test/test-utils";

describe("TOS-DEV05R1 lifecycle helpers", () => {
  it("IN_REVIEW → Review only; no Publish", () => {
    const actions = resolveArtifactLifecycle(
      sampleWorkArtifact.version_id,
      "IN_REVIEW",
      {
        stewardship_state: "IN_REVIEW",
        current_version_id: sampleWorkArtifact.version_id,
        published_version_id: null,
      },
    );
    expect(actions.kind).toBe("in_review");
    expect(actions.label).toBe("In Review");
    expect(actions.showReview).toBe(true);
    expect(actions.showView).toBe(false);
    expect(actions.showPublish).toBe(false);
  });

  it("APPROVED + current match + not published → View + Publish", () => {
    const actions = resolveArtifactLifecycle(
      sampleWorkArtifact.version_id,
      "APPROVED",
      {
        stewardship_state: "APPROVED",
        current_version_id: sampleWorkArtifact.version_id,
        published_version_id: null,
      },
    );
    expect(actions.kind).toBe("approved");
    expect(actions.label).toBe("Approved");
    expect(actions.showReview).toBe(false);
    expect(actions.showView).toBe(true);
    expect(actions.showPublish).toBe(true);
  });

  it("exact published_version_id → Published even when stewardship stays APPROVED", () => {
    const actions = resolveArtifactLifecycle(
      sampleWorkArtifact.version_id,
      "APPROVED",
      {
        stewardship_state: "APPROVED",
        current_version_id: sampleWorkArtifact.version_id,
        published_version_id: sampleWorkArtifact.version_id,
      },
    );
    expect(actions.kind).toBe("published");
    expect(actions.label).toBe("Published");
    expect(actions.showView).toBe(true);
    expect(actions.showPublish).toBe(false);
    expect(actions.showReview).toBe(false);
  });

  it("version drift fails closed (no Publish)", () => {
    const actions = resolveArtifactLifecycle(
      sampleWorkArtifact.version_id,
      "APPROVED",
      {
        stewardship_state: "APPROVED",
        current_version_id: "99999999-9999-9999-9999-999999999999",
        published_version_id: null,
      },
    );
    expect(actions.showPublish).toBe(false);
    expect(actions.showView).toBe(true);
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
      const actions = resolveArtifactLifecycle(
        sampleWorkArtifact.version_id,
        state,
        {
          stewardship_state: state,
          current_version_id: sampleWorkArtifact.version_id,
          published_version_id: null,
        },
      );
      expect(actions.showPublish).toBe(false);
      expect(actions.showReview).toBe(false);
      expect(actions.kind).toBe("other");
    }
  });

  it("viewer: APPROVED + exact published_version_id → Published, no Publish", () => {
    const actions = resolveContentVersionLifecycle(sampleWorkArtifact.version_id, {
      stewardship_state: "APPROVED",
      current_version_id: sampleWorkArtifact.version_id,
      published_version_id: sampleWorkArtifact.version_id,
    });
    expect(actions.label).toBe("Published");
    expect(actions.showPublish).toBe(false);
  });

  it("builds review path with bounded fromWork context", () => {
    expect(reviewPathForArtifact(sampleWorkArtifact, WORK_ID)).toContain(
      `fromWork=${WORK_ID}`,
    );
    expect(
      reviewPathForArtifact(sampleWorkArtifact, "https://evil.example/x"),
    ).not.toContain("fromWork");
  });

  it("builds durable artifact view path", () => {
    expect(artifactViewPath(WORK_ID, sampleWorkArtifact)).toBe(
      `/teacher-os/work/${WORK_ID}/artifacts/${sampleWorkArtifact.content_id}/versions/${sampleWorkArtifact.version_id}`,
    );
  });

  it("accepts only Work UUID return targets", () => {
    expect(safeWorkReturnPath(WORK_ID)).toBe(`/teacher-os/work/${WORK_ID}`);
    expect(safeWorkReturnPath("https://evil.example")).toBeNull();
  });

  it("summary counts published from resolved lifecycle, not stewardship", () => {
    const kit = samplePreparationKitArtifacts().items;
    const resolutions = kit.map((item, index) => {
      if (index < 3) {
        return resolveArtifactLifecycle(item.version_id, "IN_REVIEW", {
          stewardship_state: "IN_REVIEW",
          current_version_id: item.version_id,
          published_version_id: null,
        });
      }
      if (index < 5) {
        return resolveArtifactLifecycle(item.version_id, "APPROVED", {
          stewardship_state: "APPROVED",
          current_version_id: item.version_id,
          published_version_id: null,
        });
      }
      return resolveArtifactLifecycle(item.version_id, "APPROVED", {
        stewardship_state: "APPROVED",
        current_version_id: item.version_id,
        published_version_id: item.version_id,
      });
    });
    const summary = summarizeResolvedLifecycle(resolutions);
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
});
