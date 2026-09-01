import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBackendRoot } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const backendRoot = resolveBackendRoot();
const scriptPath = join(__dirname, "serve_development_app.py");

function resolveRuntimeDatabaseUrl() {
  if (process.env.PRODUCT_E2E_RUNTIME_DATABASE_URL) {
    return process.env.PRODUCT_E2E_RUNTIME_DATABASE_URL;
  }
  const dbReportPath = join(repoRoot, "tmp", "product-e2e-db.json");
  const envReportPath = join(repoRoot, "tmp", "product-e2e-env.json");
  try {
    const envReport = JSON.parse(readFileSync(envReportPath, "utf8"));
    if (envReport.runtimeDatabaseUrl) {
      return envReport.runtimeDatabaseUrl;
    }
  } catch {
    // fall through
  }
  const dbReport = JSON.parse(readFileSync(dbReportPath, "utf8"));
  return dbReport.runtime_database_url;
}

const runtimeDatabaseUrl = resolveRuntimeDatabaseUrl();
const { VIRTUAL_ENV: _ignoredVirtualEnv, ...baseEnv } = process.env;

const child = spawn(
  process.env.PRODUCT_E2E_UV || "uv",
  ["run", "python", scriptPath],
  {
    cwd: backendRoot,
    env: {
      ...baseEnv,
      AIEOS_BACKEND_ROOT: backendRoot,
      PRODUCT_E2E_RUNTIME_DATABASE_URL: runtimeDatabaseUrl,
      PYTHONPATH: [join(backendRoot, "src"), backendRoot].join(
        process.platform === "win32" ? ";" : ":",
      ),
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => process.exit(code ?? 1));

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
