import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const DEV_TENANT_ID = "71b5fb49-2bdb-56c3-ab7c-3b33e92a89f0";
export const DEV_BEARER_TOKEN = "product-e2e-dev";

export type ProductFixture = {
  scenario_id: string;
  backend_pin_sha: string;
  tenant_id: string;
  principal_id: string;
  bearer_token: string;
  work_id: string;
  content_id: string;
  version_id: string;
  content_type: string;
  stewardship_state: string;
  published_version_id_before: string | null;
  current_version_id: string;
};

let cachedFixture: ProductFixture | null = null;

export function loadProductFixture(): ProductFixture {
  if (cachedFixture) return cachedFixture;
  const fixturePath =
    process.env.PRODUCT_E2E_FIXTURE_PATH ??
    resolve(process.cwd(), "tmp/product-e2e-fixture.json");
  cachedFixture = JSON.parse(readFileSync(fixturePath, "utf8")) as ProductFixture;
  return cachedFixture;
}

export async function connectDevSession(page: Page) {
  const fixture = loadProductFixture();
  if (!page.url().includes("/teacher-os/")) {
    await page.goto("/teacher-os/today");
  }
  const details = page.locator("details").filter({
    has: page.locator("summary", { hasText: /DEV session/i }),
  });
  await details.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await page.locator('input[name="tenantId"]').fill(fixture.tenant_id);
  await page.locator('input[name="bearerToken"]').fill(
    fixture.bearer_token || DEV_BEARER_TOKEN,
  );
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(/Connected \(memory only/i)).toBeVisible();
}

export function artifactPath(fixture: ProductFixture) {
  return `/teacher-os/work/${fixture.work_id}/artifacts/${fixture.content_id}/versions/${fixture.version_id}`;
}

export function apiHeaders(extra: Record<string, string> = {}) {
  const fixture = loadProductFixture();
  return {
    "X-AIEOS-Tenant-ID": fixture.tenant_id,
    Authorization: `Bearer ${fixture.bearer_token || DEV_BEARER_TOKEN}`,
    ...extra,
  };
}

export function calendarDateLocal(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(14, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
