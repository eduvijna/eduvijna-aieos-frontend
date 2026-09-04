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
] as const;

describe("TOS-DEV08-I03 OpenAPI consumer contract", () => {
  it("consumer snapshot SHA-256 matches Backend OpenAPI authority", () => {
    const bytes = readFileSync(snapshotPath);
    const digest = createHash("sha256")
      .update(bytes)
      .digest("hex")
      .toUpperCase();
    expect(digest).toBe(
      "824B389D6D4EDB2EA5D8ED3A9E5411087B566DFDCA09C2AB0CD4FDED51C4D89D",
    );
  });

  it("snapshot and generated types include Assignment + Execution + Assessment operationIds", () => {
    const snapshot = readFileSync(snapshotPath, "utf8");
    const generated = readFileSync(generatedPath, "utf8");
    for (const operationId of REQUIRED_OPERATION_IDS) {
      expect(snapshot).toContain(`"operationId": "${operationId}"`);
      expect(generated).toContain(operationId);
    }
  });
});
