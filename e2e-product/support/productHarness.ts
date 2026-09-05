import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const DEV_TENANT_ID = "71b5fb49-2bdb-56c3-ab7c-3b33e92a89f0";
export const DEV_PRINCIPAL_ID = "f85329ab-f05b-564e-a67b-318f3e1f3cf3";
export const DEV_BEARER_TOKEN = "product-e2e-dev";

export const BACKEND_PIN_SHA =
  "62733e3ad0d48887f3cd1e1a4486839170a5d651";
export const EXPECTED_MIGRATION_HEAD = "tosd090002";
export const OPENAPI_AUTHORITY_SHA =
  "B4326D43A213D7831F2AAD8E77A2CEC6BA70B800B4C62EFC52D5B8DFC07CB4D9";
export const FRONTEND_BASE_SHA =
  "05400f007c345283af9880b38e16abdbd55677e4";

export type ProductFixture = {
  scenario_id: string;
  backend_pin_sha: string;
  migration_head?: string;
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
  scenario_marker?: string;
};

export type TeachingExecutionDto = {
  execution_id: string;
  work_id: string;
  class_ref: string;
  teacher_principal_id: string;
  lifecycle_state: string;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  aggregate_revision: number;
  bindings: Array<{
    content_id: string;
    content_version_id: string;
    artifact_kind: string;
  }>;
  observations: Array<{
    observation_id: string;
    observation_kind: string;
    body: string;
    revision: number;
  }>;
};

let cachedFixture: ProductFixture | null = null;

export function loadProductFixture(): ProductFixture {
  if (cachedFixture) return cachedFixture;
  const fixturePath =
    process.env.PRODUCT_E2E_FIXTURE_PATH ??
    resolve(process.cwd(), "tmp/product-e2e-fixture.json");
  cachedFixture = JSON.parse(readFileSync(fixturePath, "utf8")) as ProductFixture;
  expect(cachedFixture.backend_pin_sha).toBe(BACKEND_PIN_SHA);
  if (cachedFixture.migration_head) {
    expect(cachedFixture.migration_head).toBe(EXPECTED_MIGRATION_HEAD);
  }
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

export async function fetchTeachingExecution(
  page: Page,
  executionId: string,
): Promise<TeachingExecutionDto> {
  const response = await page.request.get(
    `/api/v1/teaching/executions/${executionId}`,
    { headers: apiHeaders() },
  );
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<TeachingExecutionDto>;
}

export function assertNoLearnerExecutionFields(payload: Record<string, unknown>) {
  for (const key of [
    "learner_id",
    "student_id",
    "attendance",
    "score",
    "grade",
    "mastery",
  ]) {
    expect(payload).not.toHaveProperty(key);
  }
}

export type ClassroomAssessmentDto = {
  assessment_id: string;
  lifecycle_state: string;
  class_ref: string;
  class_result_level: string;
  class_result_note: string | null;
  content_id: string;
  content_version_id: string;
  execution_id: string | null;
  work_id: string | null;
  assignment_id: string | null;
  aggregate_revision: number;
  teacher_principal_id: string;
  recorded_at: string;
  voided_at: string | null;
};

export async function listClassroomAssessments(
  page: Page,
  filters?: {
    executionId?: string;
    workId?: string;
    classRef?: string;
    limit?: number;
  },
): Promise<ClassroomAssessmentDto[]> {
  const response = await page.request.get(
    "/api/v1/assessment/classroom-assessments",
    {
      headers: apiHeaders(),
      params: {
        execution_id: filters?.executionId,
        work_id: filters?.workId,
        class_ref: filters?.classRef,
        limit: filters?.limit ?? 50,
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { items: ClassroomAssessmentDto[] };
  return body.items;
}

export async function fetchClassroomAssessment(
  page: Page,
  assessmentId: string,
): Promise<{ data: ClassroomAssessmentDto; etag: string | null }> {
  const response = await page.request.get(
    `/api/v1/assessment/classroom-assessments/${assessmentId}`,
    { headers: apiHeaders() },
  );
  expect(response.ok()).toBeTruthy();
  return {
    data: (await response.json()) as ClassroomAssessmentDto,
    etag: response.headers()["etag"] ?? null,
  };
}

export function assertNoLearnerAssessmentFields(
  payload: Record<string, unknown>,
) {
  for (const key of [
    "learner_id",
    "student_id",
    "LearnerRef",
    "StudentRef",
    "roster",
    "score",
    "grade",
    "mastery",
    "individual_result",
  ]) {
    expect(payload).not.toHaveProperty(key);
  }
}

export type TeachingWorkDto = {
  work_id: string;
  intent_type: string;
  goal_text: string;
  class_label: string | null;
  subject: string | null;
  topic: string | null;
  target_date: string;
  locale: string;
  aggregate_revision: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export async function fetchTeachingWork(
  page: Page,
  workId: string,
): Promise<{ data: TeachingWorkDto; etag: string | null }> {
  const response = await page.request.get(`/api/v1/teaching/works/${workId}`, {
    headers: apiHeaders(),
  });
  expect(response.ok()).toBeTruthy();
  return {
    data: (await response.json()) as TeachingWorkDto,
    etag: response.headers()["etag"] ?? null,
  };
}

export async function listTeachingWorkArtifacts(
  page: Page,
  workId: string,
): Promise<{ work_id: string; items: unknown[] }> {
  const response = await page.request.get(
    `/api/v1/teaching/works/${workId}/artifacts`,
    { headers: apiHeaders() },
  );
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ work_id: string; items: unknown[] }>;
}

/** Local calendar date YYYY-MM-DD for HTML date inputs (Improve Product E2E). */
export function calendarDateOnlyLocal(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function assertNoApiMocksInstalled(page: Page) {
  const routes = (page as unknown as { _routes?: unknown[] })._routes;
  if (routes && routes.length > 0) {
    throw new Error("Product E2E must not register page.route handlers");
  }
}
