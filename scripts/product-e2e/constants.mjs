/** TOS-DEV09-I03 governed pins (existing product journeys; Improve product E2E is I04). */

export const FRONTEND_BASE_SHA =
  "30c94f3e0403b9a5a2e955c706766035490598f9";

export const BACKEND_PIN_SHA =
  "62733e3ad0d48887f3cd1e1a4486839170a5d651";

export const OPENAPI_AUTHORITY_SHA =
  "B4326D43A213D7831F2AAD8E77A2CEC6BA70B800B4C62EFC52D5B8DFC07CB4D9";

export const EXPECTED_MIGRATION_HEAD = "tosd090002";

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
