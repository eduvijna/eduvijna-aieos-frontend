import { describe, expect, it } from "vitest";
import {
  isCompletePreparationKit,
  orderPreparationArtifacts,
  preparationArtifactLabel,
  PREPARATION_ARTIFACT_KINDS,
} from "./preparationKit";
import type { WorkArtifactItem } from "@/services/api/generated/teachingTypes";
import { samplePreparationKitArtifacts, sampleWorkArtifact } from "@/test/test-utils";

describe("preparationKit helpers", () => {
  it("maps quiz technical kind to Quick Quiz label", () => {
    expect(preparationArtifactLabel("quiz")).toBe("Quick Quiz");
    expect(preparationArtifactLabel("lesson_plan")).toBe("Lesson Plan");
  });

  it("detects complete kits and rejects DEV03 singular histories", () => {
    expect(
      isCompletePreparationKit(samplePreparationKitArtifacts().items),
    ).toBe(true);
    expect(isCompletePreparationKit([sampleWorkArtifact])).toBe(false);
    expect(isCompletePreparationKit([])).toBe(false);
  });

  it("orders scrambled kit items canonically", () => {
    const scrambled = [...samplePreparationKitArtifacts().items].reverse();
    const ordered = orderPreparationArtifacts(scrambled);
    expect(ordered.map((item) => item.artifact_kind)).toEqual([
      ...PREPARATION_ARTIFACT_KINDS,
    ]);
  });

  it("keeps unknown kinds after canonical ones", () => {
    const extra: WorkArtifactItem = {
      ...sampleWorkArtifact,
      artifact_kind: "custom_note",
      title: "Custom",
    };
    const ordered = orderPreparationArtifacts([
      extra,
      ...samplePreparationKitArtifacts().items,
    ]);
    expect(ordered.at(-1)?.artifact_kind).toBe("custom_note");
  });
});
