#!/usr/bin/env node
/**
 * Sync the NON-AUTHORITATIVE consumer OpenAPI snapshot from the AIEOS backend.
 *
 * Usage:
 *   node scripts/sync-openapi-snapshot.mjs
 *   AIEOS_BACKEND_ROOT=../eduvijna-aieos-backend node scripts/sync-openapi-snapshot.mjs
 *   AIEOS_BACKEND_OPENAPI_SHA=bcfd5eb0... node scripts/sync-openapi-snapshot.mjs
 *
 * Expected source (relative to backend root):
 *   contracts/openapi/aieos-v1.json
 *
 * Destination (this repo):
 *   contracts/openapi/aieos-v1.consumer-snapshot.json
 *
 * TOS-DEV03R2 pinned backend PR head SHA:
 *   b4b6211bdf0f0355749555689eabaed814d25bb6
 * Consumer OpenAPI SHA-256:
 *   BBE357612BFF091F7EAF54A4C5F1065B248BB0212A3F0DDF4AFF0685C759C4C7
 *
 * This script copies the file only. It does NOT mutate the backend repo.
 * Update contracts/openapi/README.md when changing the pinned SHA.
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

const PINNED_SHA = "b4b6211bdf0f0355749555689eabaed814d25bb6";
const backendRoot =
  process.env.AIEOS_BACKEND_ROOT ||
  path.resolve(frontendRoot, "..", "eduvijna-aieos-backend");
const expectedSha = process.env.AIEOS_BACKEND_OPENAPI_SHA || PINNED_SHA;

const source = path.join(backendRoot, "contracts", "openapi", "aieos-v1.json");
const destDir = path.join(frontendRoot, "contracts", "openapi");
const dest = path.join(destDir, "aieos-v1.consumer-snapshot.json");

if (!existsSync(source)) {
  console.error(
    `[sync-openapi] Source not found: ${source}\n` +
      `Set AIEOS_BACKEND_ROOT to a checkout of eduvijna-aieos-backend at SHA ${expectedSha}.`,
  );
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);

console.log(`[sync-openapi] Copied:`);
console.log(`  from: ${source}`);
console.log(`  to:   ${dest}`);
console.log(
  `[sync-openapi] Reminder: verify backend checkout matches SHA ${expectedSha}, then run pnpm generate:api-types.`,
);
