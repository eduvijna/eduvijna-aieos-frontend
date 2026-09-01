/** TOS-DEV06-I05 governed pins and development session defaults. */

export const FRONTEND_BASE_SHA =
  "e8d5776e9b51c4f19eaa2d0aafe4e7aa80315fcc";

export const BACKEND_PIN_SHA =
  "06e05277e73e0c71172cae4904efb37d771c3fad";

export const OPENAPI_AUTHORITY_SHA =
  "CCD233062672B36A4DB6C6B60E7413AF8EEC6FDAAE9550270C6879E4C4A06D7C";

export const EXPECTED_MIGRATION_HEAD = "tosd060002";

/** Synthetic development tenant/principal from backend teacher_os_review_scenario. */
export const DEV_TENANT_ID = "71b5fb49-2bdb-56c3-ab7c-3b33e92a89f0";
export const DEV_PRINCIPAL_ID = "f85329ab-f05b-564e-a67b-318f3e1f3cf3";
export const DEV_BEARER_TOKEN = "product-e2e-dev";

export const DEFAULT_BACKEND_PORT = 8000;
export const DEFAULT_FRONTEND_PORT = 5181;
export const DEFAULT_PG_PORT = 55433;
export const PRODUCT_E2E_CONTAINER = "aieos-product-e2e-pg";

export function resolveBackendRoot() {
  const root = process.env.AIEOS_BACKEND_ROOT;
  if (!root) {
    throw new Error(
      "AIEOS_BACKEND_ROOT is required (path to eduvijna-aieos-backend checkout).",
    );
  }
  return root;
}
