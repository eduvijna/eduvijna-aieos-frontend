import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBackendRoot } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolveBackendRoot();
const scriptPath = join(__dirname, "serve_development_app.py");

const child = spawn(
  process.env.PRODUCT_E2E_UV || "uv",
  ["run", "python", scriptPath],
  {
    cwd: backendRoot,
    env: {
      ...process.env,
      AIEOS_BACKEND_ROOT: backendRoot,
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
