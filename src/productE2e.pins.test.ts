import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const EXPECTED_BACKEND =
  "62733e3ad0d48887f3cd1e1a4486839170a5d651";
const EXPECTED_MIGRATION = "tosd090002";
const EXPECTED_OPENAPI =
  "B4326D43A213D7831F2AAD8E77A2CEC6BA70B800B4C62EFC52D5B8DFC07CB4D9";
const EXPECTED_FRONTEND_BASE =
  "05400f007c345283af9880b38e16abdbd55677e4";
const OBSOLETE_BACKEND = "1fe28f4fd1a2a2070aa69d67daa49cd53ba5820d";
const OBSOLETE_MIGRATION = "tosd080002";

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("TOS-DEV09 product-E2E pin consistency", () => {
  it("keeps constants.mjs, harness, seed, bootstrap, and CI on the same pins", () => {
    const constants = read("scripts/product-e2e/constants.mjs");
    expect(constants).toContain(EXPECTED_BACKEND);
    expect(constants).toContain(EXPECTED_MIGRATION);
    expect(constants).toContain(EXPECTED_OPENAPI);
    expect(constants).toContain(EXPECTED_FRONTEND_BASE);
    expect(constants).toMatch(/BACKEND_PIN_SHA\s*=/);
    expect(constants).toMatch(/EXPECTED_MIGRATION_HEAD\s*=\s*"tosd090002"/);
    expect(constants).toMatch(/OPENAPI_AUTHORITY_SHA\s*=/);
    expect(constants).toMatch(/FRONTEND_BASE_SHA\s*=/);
    expect(constants).not.toContain(OBSOLETE_BACKEND);
    expect(constants).not.toContain(OBSOLETE_MIGRATION);

    const harness = read("e2e-product/support/productHarness.ts");
    expect(harness).toContain(`"${EXPECTED_BACKEND}"`);
    expect(harness).toContain(`"${EXPECTED_MIGRATION}"`);
    expect(harness).not.toContain(OBSOLETE_BACKEND);
    expect(harness).not.toContain(OBSOLETE_MIGRATION);

    const seed = read("scripts/product-e2e/seed_precondition.py");
    expect(seed).toContain(`BACKEND_PIN_SHA = "${EXPECTED_BACKEND}"`);
    expect(seed).toContain(
      `EXPECTED_MIGRATION_HEAD = "${EXPECTED_MIGRATION}"`,
    );
    expect(seed).not.toContain(OBSOLETE_BACKEND);
    expect(seed).not.toContain(OBSOLETE_MIGRATION);

    const bootstrap = read("scripts/product-e2e/bootstrap_database.py");
    expect(bootstrap).toContain(EXPECTED_MIGRATION);
    expect(bootstrap).not.toContain(OBSOLETE_MIGRATION);

    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain(`AIEOS_BACKEND_PIN_SHA: ${EXPECTED_BACKEND}`);
    expect(ci).toContain(`ref: ${EXPECTED_BACKEND}`);
    expect(ci).not.toContain(OBSOLETE_BACKEND);

    const readme = read("docs/product-e2e/README.md");
    expect(readme).toContain(EXPECTED_BACKEND);
    expect(readme).toContain(EXPECTED_MIGRATION);
    expect(readme).toContain(EXPECTED_OPENAPI);
    expect(readme).toContain(EXPECTED_FRONTEND_BASE);
    expect(readme).toContain("teacher-os-improve.product.spec.ts");
    expect(readme).not.toContain("Improve product E2E remains TOS-DEV09-I04");
  });
});
