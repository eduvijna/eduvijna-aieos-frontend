import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const tmpDir = join(repoRoot, "tmp");
const fixturePath = join(tmpDir, "product-e2e-fixture.json");

export default async function globalSetup() {
  mkdirSync(tmpDir, { recursive: true });
  process.env.PRODUCT_E2E_FIXTURE_PATH = fixturePath;
  writeFileSync(
    join(tmpDir, "product-e2e-env.json"),
    JSON.stringify({ fixturePath }, null, 2) + "\n",
    "utf8",
  );
}
