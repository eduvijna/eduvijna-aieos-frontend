import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BACKEND_PIN_SHA,
  DEFAULT_PG_PORT,
  resolveBackendRoot,
} from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const tmpDir = join(repoRoot, "tmp");
mkdirSync(tmpDir, { recursive: true });

const dbReportPath = join(tmpDir, "product-e2e-db.json");
const fixturePath = join(tmpDir, "product-e2e-fixture.json");

function runPython(scriptName, extraEnv = {}) {
  const backendRoot = resolveBackendRoot();
  const backendHead = spawnSync("git", ["-C", backendRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  if (backendHead.status !== 0) {
    throw new Error(`Could not read backend HEAD: ${backendHead.stderr}`);
  }
  const head = backendHead.stdout.trim();
  if (head !== BACKEND_PIN_SHA) {
    throw new Error(
      `Backend HEAD ${head} does not match pin ${BACKEND_PIN_SHA}`,
    );
  }

  const uv = process.env.PRODUCT_E2E_UV || "uv";
  const env = {
    ...process.env,
    AIEOS_BACKEND_ROOT: backendRoot,
    PRODUCT_E2E_DB_REPORT: dbReportPath,
    PRODUCT_E2E_FIXTURE_PATH: fixturePath,
    AIEOS_TEST_PG_PORT: process.env.AIEOS_TEST_PG_PORT || String(DEFAULT_PG_PORT),
    PYTHONPATH: [join(backendRoot, "src"), backendRoot].join(
      process.platform === "win32" ? ";" : ":",
    ),
    ...extraEnv,
  };
  const scriptPath = join(__dirname, scriptName);
  const result = spawnSync(uv, ["run", "python", scriptPath], {
    cwd: backendRoot,
    env,
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} failed with exit code ${result.status}`);
  }
}

export default async function globalSetup() {
  if (process.env.PRODUCT_E2E_SKIP_BOOTSTRAP === "1") {
    process.env.PRODUCT_E2E_FIXTURE_PATH = fixturePath;
    return;
  }

  runPython("bootstrap_database.py");
  const dbReport = JSON.parse(readFileSync(dbReportPath, "utf8"));
  process.env.PRODUCT_E2E_RUNTIME_DATABASE_URL = dbReport.runtime_database_url;
  runPython("seed_precondition.py", {
    PRODUCT_E2E_RUNTIME_DATABASE_URL: dbReport.runtime_database_url,
  });

  writeFileSync(
    join(tmpDir, "product-e2e-env.json"),
    JSON.stringify(
      {
        fixturePath,
        runtimeDatabaseUrl: dbReport.runtime_database_url,
        backendPinSha: BACKEND_PIN_SHA,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  process.env.PRODUCT_E2E_FIXTURE_PATH = fixturePath;
  process.env.PRODUCT_E2E_RUNTIME_DATABASE_URL = dbReport.runtime_database_url;
}
