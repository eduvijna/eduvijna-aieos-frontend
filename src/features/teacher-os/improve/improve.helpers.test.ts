import { describe, expect, it } from "vitest";
import {
  remediationCreateMaterial,
  retainOrMintIdempotencyKey,
  clearIdempotencyAssociation,
} from "./improveIdempotency";
import {
  formatImproveIntentLabel,
  improveHrefForAssessment,
  isEligibleForImprove,
} from "./improvePresentation";

describe("TOS-DEV09-I03 improve presentation", () => {
  it("builds Improve query-param handoff href", () => {
    expect(improveHrefForAssessment("aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa")).toBe(
      "/teacher-os/improve?assessment_id=aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa",
    );
  });

  it("treats only RECORDED as eligible", () => {
    expect(isEligibleForImprove({ lifecycle_state: "RECORDED" })).toBe(true);
    expect(isEligibleForImprove({ lifecycle_state: "VOIDED" })).toBe(false);
  });

  it("labels remediate_class for Work UX", () => {
    expect(formatImproveIntentLabel("remediate_class")).toBe("Remediate class");
    expect(formatImproveIntentLabel("prepare_tomorrow")).toBe("Prepare tomorrow");
  });
});

describe("TOS-DEV09-I03 improve idempotency", () => {
  const base = {
    assessmentId: "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa",
    expectedAssessmentAggregateRevision: 2,
    goalText: "Re-teach plant parts with more practice",
    targetDate: "2026-09-10",
    locale: "en-IN",
    subject: "Science",
    topic: "Leaves",
  };

  it("stable key on unchanged retry material", () => {
    const keyRef = { current: null as string | null };
    const materialRef = { current: null as string | null };
    const material = remediationCreateMaterial(base);
    const first = retainOrMintIdempotencyKey(material, keyRef, materialRef, () => "key-1");
    const second = retainOrMintIdempotencyKey(material, keyRef, materialRef, () => "key-2");
    expect(first).toBe("key-1");
    expect(second).toBe("key-1");
  });

  it("changed fingerprint establishes a new submission key", () => {
    const keyRef = { current: null as string | null };
    const materialRef = { current: null as string | null };
    const firstMaterial = remediationCreateMaterial(base);
    retainOrMintIdempotencyKey(firstMaterial, keyRef, materialRef, () => "key-1");
    const changed = remediationCreateMaterial({
      ...base,
      expectedAssessmentAggregateRevision: 3,
    });
    const next = retainOrMintIdempotencyKey(changed, keyRef, materialRef, () => "key-2");
    expect(next).toBe("key-2");
  });

  it("cleared association after stale/conflict forces a new key", () => {
    const keyRef = { current: null as string | null };
    const materialRef = { current: null as string | null };
    const material = remediationCreateMaterial(base);
    retainOrMintIdempotencyKey(material, keyRef, materialRef, () => "key-1");
    clearIdempotencyAssociation(keyRef, materialRef);
    const next = retainOrMintIdempotencyKey(material, keyRef, materialRef, () => "key-3");
    expect(next).toBe("key-3");
  });

  it("fingerprint includes only governed create fields", () => {
    const material = remediationCreateMaterial(base);
    expect(material).toContain('"assessment_id"');
    expect(material).toContain('"expected_assessment_aggregate_revision"');
    expect(material).toContain('"goal_text"');
    expect(material).toContain('"target_date"');
    expect(material).toContain('"locale"');
    expect(material).toContain('"subject"');
    expect(material).toContain('"topic"');
    expect(material).not.toContain("class_ref");
    expect(material).not.toContain("class_label");
    expect(material).not.toContain("class_result_note");
    expect(material).not.toContain("intent_type");
  });
});
