/** TOS-DEV08-I04 governed pins and development session defaults. */

export const FRONTEND_BASE_SHA =
  "398710f168c81cf6fb1f6aebe2b667a1a0bfc575";

export const BACKEND_PIN_SHA =
  "1fe28f4fd1a2a2070aa69d67daa49cd53ba5820d";

export const OPENAPI_AUTHORITY_SHA =
  "824B389D6D4EDB2EA5D8ED3A9E5411087B566DFDCA09C2AB0CD4FDED51C4D89D";

export const EXPECTED_MIGRATION_HEAD = "tosd080002";

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
