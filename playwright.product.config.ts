import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = Number(process.env.PLAYWRIGHT_PORT || 5181);
const BACKEND_PORT = Number(process.env.PRODUCT_E2E_BACKEND_PORT || 8000);
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

export default defineConfig({
  testDir: "./e2e-product",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-product-report" }],
  ],
  globalSetup: "./scripts/product-e2e/global-setup.mjs",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node scripts/product-e2e/start-backend.mjs",
      url: `${BACKEND_URL}/docs`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        ...process.env,
        PRODUCT_E2E_BACKEND_PORT: String(BACKEND_PORT),
        PRODUCT_E2E_BACKEND_HOST: "127.0.0.1",
      },
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${FRONTEND_PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_DEV_API_PROXY_TARGET: BACKEND_URL,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
