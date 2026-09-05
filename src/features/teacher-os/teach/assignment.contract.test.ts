import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const snapshotPath = path.join(
  repoRoot,
  "contracts/openapi/aieos-v1.consumer-snapshot.json",
);
const generatedPath = path.join(
  repoRoot,
  "src/services/api/generated/aieos-v1.ts",
);

const REQUIRED_OPERATION_IDS = [
  "teacher_os_school_context_classes_list",
  "teaching_assignment_create",
  "teaching_assignment_list",
  "teaching_assignment_get",
  "teaching_assignment_due_update",
  "teaching_assignment_close",
  "teaching_assignment_cancel",
  "teacher_os_teach_context_get",
  "teaching_execution_list",
  "teaching_execution_start",
  "teaching_execution_get",
  "teaching_execution_complete",
  "teaching_execution_cancel",
  "teaching_execution_observation_create",
  "teaching_execution_observation_correct",
  "assessment_classroom_list",
  "assessment_classroom_record",
  "assessment_classroom_get",
  "assessment_classroom_correct",
  "assessment_classroom_void",
  "teaching_work_from_classroom_assessment_create",
] as const;

describe("TOS-DEV09-I03 OpenAPI consumer contract", () => {
  it("pins Backend OpenAPI source SHA in sync script", () => {
    const syncScript = readFileSync(
      path.join(repoRoot, "scripts/sync-openapi-snapshot.mjs"),
      "utf8",
    );
    expect(syncScript).toContain(
      '62733e3ad0d48887f3cd1e1a4486839170a5d651',
    );
    expect(syncScript).toContain(
      "B4326D43A213D7831F2AAD8E77A2CEC6BA70B800B4C62EFC52D5B8DFC07CB4D9",
    );
  });

  it("consumer snapshot SHA-256 matches Backend OpenAPI authority", () => {
    const bytes = readFileSync(snapshotPath);
    const digest = createHash("sha256")
      .update(bytes)
      .digest("hex")
      .toUpperCase();
    expect(digest).toBe(
      "B4326D43A213D7831F2AAD8E77A2CEC6BA70B800B4C62EFC52D5B8DFC07CB4D9",
    );
  });

  it("snapshot and generated types include Assessment + remediation create operationIds", () => {
    const snapshot = readFileSync(snapshotPath, "utf8");
    const generated = readFileSync(generatedPath, "utf8");
    for (const operationId of REQUIRED_OPERATION_IDS) {
      expect(snapshot).toContain(`"operationId": "${operationId}"`);
      expect(generated).toContain(operationId);
    }
  });

  it("does not invent an /improvements API or learner/mastery/memory surface", () => {
    const snapshot = readFileSync(snapshotPath, "utf8");
    expect(snapshot).not.toMatch(/\/api\/v1\/improvements/);
    expect(snapshot).not.toMatch(/operationId": ".*mastery/);
    expect(snapshot).not.toMatch(/operationId": ".*teacher_memory/);
    expect(snapshot).not.toMatch(/\/api\/v1\/learners/);
  });
});
