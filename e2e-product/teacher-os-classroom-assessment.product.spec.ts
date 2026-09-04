import { test, expect } from "@playwright/test";
import {
  apiHeaders,
  artifactPath,
  assertNoLearnerAssessmentFields,
  connectDevSession,
  DEV_PRINCIPAL_ID,
  fetchClassroomAssessment,
  fetchTeachingExecution,
  listClassroomAssessments,
  loadProductFixture,
} from "./support/productHarness";

/**
 * TOS-DEV08-I04 ClassroomAssessment real-stack product journey.
 * Zero page.route API mocks — all traffic via Vite /api proxy to FastAPI.
 * Self-contained prerequisites (does not rely on Assignment/Execution spec order).
 */

test.describe.configure({ mode: "serial" });

let fixture: ReturnType<typeof loadProductFixture>;

const RECORD_NOTE = "Class showed mixed progress on fraction comparison.";
const CORRECT_NOTE = "Class progress improved after the second visual model.";

const state: {
  assignmentId: string | null;
  executionId: string | null;
  assessmentId: string | null;
  revisionAfterRecord: number | null;
  revisionAfterCorrect: number | null;
  revisionBeforeStaleVoid: number | null;
  etagBeforeStaleVoid: string | null;
} = {
  assignmentId: null,
  executionId: null,
  assessmentId: null,
  revisionAfterRecord: null,
  revisionAfterCorrect: null,
  revisionBeforeStaleVoid: null,
  etagBeforeStaleVoid: null,
};

function assertNoApiMocksInstalled(page: import("@playwright/test").Page) {
  const routes = (page as unknown as { _routes?: unknown[] })._routes;
  if (routes && routes.length > 0) {
    throw new Error("Product E2E must not register page.route handlers");
  }
}

async function fetchContent(page: import("@playwright/test").Page) {
  const f = loadProductFixture();
  const response = await page.request.get(`/api/v1/contents/${f.content_id}`, {
    headers: apiHeaders(),
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{
    content_id: string;
    published_version_id: string | null;
    current_version_id: string;
    stewardship_state: string;
    content_type: string;
  }>;
}

async function ensurePublishedExactVersion(
  page: import("@playwright/test").Page,
) {
  const f = loadProductFixture();
  const content = await fetchContent(page);
  if (content.published_version_id === f.version_id) {
    return;
  }
  await page.goto(artifactPath(f));
  await connectDevSession(page);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByText(/Published\. This version is now the published pointer/i),
  ).toBeVisible();
  const after = await fetchContent(page);
  expect(after.published_version_id).toBe(f.version_id);
}

async function ensureActiveAssignment(
  page: import("@playwright/test").Page,
): Promise<string> {
  const f = loadProductFixture();
  const listResponse = await page.request.get("/api/v1/teaching/assignments", {
    headers: apiHeaders(),
  });
  expect(listResponse.ok()).toBeTruthy();
  const list = (await listResponse.json()) as {
    items: Array<{
      assignment_id: string;
      class_ref: string;
      lifecycle_state: string;
      source_work_id: string | null;
      content_version_id: string;
    }>;
  };
  const existing = list.items.find(
    (item) =>
      item.class_ref === "class-5a" &&
      item.lifecycle_state === "ACTIVE" &&
      item.source_work_id === f.work_id &&
      item.content_version_id === f.version_id,
  );
  if (existing) {
    return existing.assignment_id;
  }

  await page.goto(artifactPath(f));
  await connectDevSession(page);
  await page.getByRole("button", { name: "Assign to class" }).click();
  await page.getByRole("combobox", { name: "Class" }).selectOption("class-5a");
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(
    page.getByRole("heading", { name: "Assignment created" }),
  ).toBeVisible();

  const after = await page.request.get("/api/v1/teaching/assignments", {
    headers: apiHeaders(),
  });
  const afterList = (await after.json()) as {
    items: Array<{
      assignment_id: string;
      class_ref: string;
      lifecycle_state: string;
      source_work_id: string | null;
    }>;
  };
  const created = afterList.items.find(
    (item) =>
      item.class_ref === "class-5a" &&
      item.lifecycle_state === "ACTIVE" &&
      item.source_work_id === f.work_id,
  );
  expect(created).toBeTruthy();
  return created!.assignment_id;
}

test.describe("TOS-DEV08-I04 ClassroomAssessment Product E2E", () => {
  test.beforeAll(() => {
    fixture = loadProductFixture();
  });

  test.beforeEach(({ page }) => {
    assertNoApiMocksInstalled(page);
  });

  test("Phase A–B — Publish, assign, START and COMPLETE TeachingExecution", async ({
    page,
  }) => {
    const f = fixture;
    await ensurePublishedExactVersion(page);
    state.assignmentId = await ensureActiveAssignment(page);

    await page.goto("/teacher-os/teach");
    await connectDevSession(page);
    await page
      .getByRole("combobox", { name: "Teaching work" })
      .selectOption(f.work_id);
    await page.getByRole("combobox", { name: "Class" }).selectOption("class-5a");
    await expect(
      page.getByRole("heading", { name: "Teach context" }),
    ).toBeVisible();
    await page
      .getByRole("checkbox", { name: "Bind Fractions Worksheet" })
      .check();

    await page.getByRole("button", { name: "Start lesson" }).click();
    await expect(page).toHaveURL(/\/teacher-os\/teach\/executions\/[^/]+$/);
    const match = page.url().match(/\/executions\/([^/]+)$/);
    expect(match?.[1]).toBeTruthy();
    state.executionId = match![1];

    await page.getByRole("button", { name: "Complete lesson" }).click();
    await page.getByRole("button", { name: "Confirm complete" }).click();
    await expect(
      page.locator(".lifecycle-pill", { hasText: "COMPLETED" }),
    ).toBeVisible();

    const durable = await fetchTeachingExecution(page, state.executionId!);
    expect(durable.lifecycle_state).toBe("COMPLETED");
    expect(durable.bindings).toEqual([
      {
        content_id: f.content_id,
        content_version_id: f.version_id,
        artifact_kind: "worksheet",
      },
    ]);
  });

  test("Phase C — COMPLETED does not auto-create ClassroomAssessment", async ({
    page,
  }) => {
    expect(state.executionId).toBeTruthy();
    const items = await listClassroomAssessments(page, {
      executionId: state.executionId!,
    });
    expect(items).toHaveLength(0);

    await page.goto(`/teacher-os/teach/executions/${state.executionId}`);
    await connectDevSession(page);
    await expect(
      page.getByRole("link", { name: /Assess this class/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Opening Assess does not create a ClassroomAssessment/i),
    ).toBeVisible();
  });

  test("Phase D — Navigate Assess this class into Teacher OS Assess", async ({
    page,
  }) => {
    expect(state.executionId).toBeTruthy();
    await page.goto(`/teacher-os/teach/executions/${state.executionId}`);
    await connectDevSession(page);
    await page.getByRole("link", { name: /Assess this class/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/teacher-os/assess\\?execution_id=${state.executionId}`),
    );
    await expect(
      page.getByRole("heading", { name: /Assess|Classroom assessment/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Record class result" }),
    ).toBeVisible();
    await expect(page.locator("code", { hasText: state.executionId! })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record class assessment" }),
    ).toBeVisible();
  });

  test("Phase E — Deliberate RECORD through real Assessment API", async ({
    page,
  }) => {
    const f = fixture;
    expect(state.executionId).toBeTruthy();

    await page.goto(`/teacher-os/assess?execution_id=${state.executionId}`);
    await connectDevSession(page);
    await expect(
      page.getByRole("heading", { name: "Record class result" }),
    ).toBeVisible();

    await page.getByRole("radio", { name: /^Mixed/i }).check();
    await page.getByLabel("Class result note").fill(RECORD_NOTE);

    const recordRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/v1/assessment/classroom-assessments") &&
        !request.url().includes("/actions/"),
    );
    const recordResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/v1/assessment/classroom-assessments") &&
        !response.url().includes("/actions/") &&
        response.status() === 201,
    );
    await page.getByRole("button", { name: "Record class assessment" }).click();
    const request = await recordRequest;
    const response = await recordResponse;

    expect(request.headers()["idempotency-key"]).toBeTruthy();
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body.execution_id).toBe(state.executionId);
    expect(body.work_id).toBe(f.work_id);
    expect(body.class_ref).toBe("class-5a");
    expect(body.content_id).toBe(f.content_id);
    expect(body.content_version_id).toBe(f.version_id);
    expect(body.class_result_level).toBe("MIXED");
    expect(body.class_result_note).toBe(RECORD_NOTE);
    expect(body).not.toHaveProperty("learner_id");
    expect(body).not.toHaveProperty("student_id");

    const created = (await response.json()) as {
      assessment_id: string;
      lifecycle_state: string;
      aggregate_revision: number;
      execution_id: string | null;
      work_id: string | null;
      class_ref: string;
      content_id: string;
      content_version_id: string;
      class_result_level: string;
      teacher_principal_id: string;
    };
    expect(created.lifecycle_state).toBe("RECORDED");
    expect(created.execution_id).toBe(state.executionId);
    expect(created.work_id).toBe(f.work_id);
    expect(created.class_ref).toBe("class-5a");
    expect(created.content_id).toBe(f.content_id);
    expect(created.content_version_id).toBe(f.version_id);
    expect(created.class_result_level).toBe("MIXED");
    expect(created.teacher_principal_id).toBe(DEV_PRINCIPAL_ID);
    assertNoLearnerAssessmentFields(created as unknown as Record<string, unknown>);

    state.assessmentId = created.assessment_id;
    state.revisionAfterRecord = created.aggregate_revision;

    await expect(
      page
        .getByRole("region", { name: "Classroom assessment", exact: true })
        .locator(".lifecycle-pill", { hasText: "RECORDED" }),
    ).toBeVisible();
    await expect(page.getByText(RECORD_NOTE).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Correct assessment/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Record class result" }),
    ).toHaveCount(0);
  });

  test("Phase F — Reload preserves RECORDED Assessment from PostgreSQL", async ({
    page,
  }) => {
    const f = fixture;
    expect(state.assessmentId).toBeTruthy();
    expect(state.executionId).toBeTruthy();

    await page.goto(`/teacher-os/assess?assessment_id=${state.assessmentId}`);
    await connectDevSession(page);
    await expect(
      page.getByRole("region", { name: "Classroom assessment", exact: true }).locator(".lifecycle-pill", { hasText: "RECORDED" }),
    ).toBeVisible();

    await page.reload();
    await connectDevSession(page);
    await expect(page).toHaveURL(
      new RegExp(`assessment_id=${state.assessmentId}`),
    );
    await expect(
      page.getByRole("region", { name: "Classroom assessment", exact: true }).locator(".lifecycle-pill", { hasText: "RECORDED" }),
    ).toBeVisible();
    await expect(page.getByText(RECORD_NOTE).first()).toBeVisible();

    const durable = await fetchClassroomAssessment(page, state.assessmentId!);
    expect(durable.data.assessment_id).toBe(state.assessmentId);
    expect(durable.data.lifecycle_state).toBe("RECORDED");
    expect(durable.data.aggregate_revision).toBe(state.revisionAfterRecord);
    expect(durable.data.execution_id).toBe(state.executionId);
    expect(durable.data.work_id).toBe(f.work_id);
    expect(durable.data.class_ref).toBe("class-5a");
    expect(durable.data.content_id).toBe(f.content_id);
    expect(durable.data.content_version_id).toBe(f.version_id);
    expect(durable.data.class_result_level).toBe("MIXED");
    expect(durable.data.class_result_note).toBe(RECORD_NOTE);
    assertNoLearnerAssessmentFields(
      durable.data as unknown as Record<string, unknown>,
    );
  });

  test("Phase G — CORRECT with If-Match and Idempotency-Key, then reload", async ({
    page,
  }) => {
    expect(state.assessmentId).toBeTruthy();

    await page.goto(`/teacher-os/assess?assessment_id=${state.assessmentId}`);
    await connectDevSession(page);

    await page.getByRole("radio", { name: /^Demonstrated/i }).check();
    await page.getByLabel("Correct class result note").fill(CORRECT_NOTE);

    const correctRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(
            `/api/v1/assessment/classroom-assessments/${state.assessmentId}/actions/correct`,
          ),
    );
    await page.getByRole("button", { name: /Correct assessment/i }).click();
    const request = await correctRequest;
    expect(request.headers()["if-match"]).toMatch(/^"r\d+"$/);
    expect(request.headers()["idempotency-key"]).toBeTruthy();
    expect(request.postDataJSON()).toEqual({
      class_result_level: "DEMONSTRATED",
      class_result_note: CORRECT_NOTE,
    });

    await expect(
      page.getByText(/Classroom assessment corrected/i),
    ).toBeVisible();
    await expect(page.getByText(CORRECT_NOTE).first()).toBeVisible();

    const afterCorrect = await fetchClassroomAssessment(
      page,
      state.assessmentId!,
    );
    expect(afterCorrect.data.lifecycle_state).toBe("RECORDED");
    expect(afterCorrect.data.class_result_level).toBe("DEMONSTRATED");
    expect(afterCorrect.data.class_result_note).toBe(CORRECT_NOTE);
    expect(afterCorrect.data.aggregate_revision).toBeGreaterThan(
      state.revisionAfterRecord!,
    );
    state.revisionAfterCorrect = afterCorrect.data.aggregate_revision;

    await page.reload();
    await connectDevSession(page);
    await expect(
      page.getByRole("region", { name: "Classroom assessment", exact: true }).locator(".lifecycle-pill", { hasText: "RECORDED" }),
    ).toBeVisible();
    await expect(page.getByText(CORRECT_NOTE).first()).toBeVisible();
    await expect(page.getByText(/DEMONSTRATED/).first()).toBeVisible();
  });

  test("Phase R1 — VOID confirmation stale race aborts without /actions/void POST", async ({
    page,
  }) => {
    expect(state.assessmentId).toBeTruthy();

    await page.goto(`/teacher-os/assess?assessment_id=${state.assessmentId}`);
    await connectDevSession(page);

    const before = await fetchClassroomAssessment(page, state.assessmentId!);
    state.revisionBeforeStaleVoid = before.data.aggregate_revision;
    state.etagBeforeStaleVoid = before.etag;
    expect(before.data.lifecycle_state).toBe("RECORDED");

    await page.getByRole("button", { name: /Void assessment/i }).click();
    await expect(
      page.getByRole("group", { name: /Confirm void ClassroomAssessment/i }),
    ).toBeVisible();

    const browserVoidPosts: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/actions/void")
      ) {
        browserVoidPosts.push(request.url());
      }
    });

    // Harness CORRECT via real API (not browser UI) advances server revision.
    const harnessCorrect = await page.request.post(
      `/api/v1/assessment/classroom-assessments/${state.assessmentId}/actions/correct`,
      {
        headers: apiHeaders({
          "Idempotency-Key": crypto.randomUUID(),
          "If-Match":
            state.etagBeforeStaleVoid ??
            `"r${state.revisionBeforeStaleVoid}"`,
          "Content-Type": "application/json",
        }),
        data: {
          class_result_level: "NOT_YET_DEMONSTRATED",
          class_result_note: "Harness concurrency injection — class-level only",
        },
      },
    );
    expect(harnessCorrect.ok()).toBeTruthy();
    const injected = (await harnessCorrect.json()) as {
      aggregate_revision: number;
      lifecycle_state: string;
      class_result_level: string;
    };
    expect(injected.lifecycle_state).toBe("RECORDED");
    expect(injected.aggregate_revision).toBe(
      state.revisionBeforeStaleVoid! + 1,
    );
    expect(injected.class_result_level).toBe("NOT_YET_DEMONSTRATED");

    await page.getByRole("button", { name: /Confirm void/i }).click();

    await expect(
      page.getByText(
        /changed on the server since you confirmed void/i,
      ),
    ).toBeVisible();
    expect(browserVoidPosts).toHaveLength(0);
    await expect(
      page.getByRole("group", { name: /Confirm void ClassroomAssessment/i }),
    ).toHaveCount(0);

    const after = await fetchClassroomAssessment(page, state.assessmentId!);
    expect(after.data.lifecycle_state).toBe("RECORDED");
    expect(after.data.aggregate_revision).toBe(
      state.revisionBeforeStaleVoid! + 1,
    );
    expect(after.data.class_result_level).toBe("NOT_YET_DEMONSTRATED");
    expect(after.data.voided_at).toBeNull();
  });

  test("Phase H — Deliberate VOID with concurrency headers; VOIDED history persists", async ({
    page,
  }) => {
    expect(state.assessmentId).toBeTruthy();

    await page.goto(`/teacher-os/assess?assessment_id=${state.assessmentId}`);
    await connectDevSession(page);
    await expect(
      page.getByRole("region", { name: "Classroom assessment", exact: true }).locator(".lifecycle-pill", { hasText: "RECORDED" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Void assessment/i }).click();
    const voidRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(
            `/api/v1/assessment/classroom-assessments/${state.assessmentId}/actions/void`,
          ),
    );
    await page.getByRole("button", { name: /Confirm void/i }).click();
    const request = await voidRequest;
    expect(request.headers()["if-match"]).toMatch(/^"r\d+"$/);
    expect(request.headers()["idempotency-key"]).toBeTruthy();

    await expect(
      page.getByText(/Classroom assessment voided/i),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Classroom assessment", exact: true }).locator(".lifecycle-pill", { hasText: "VOIDED" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Correct assessment/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Void assessment/i }),
    ).toHaveCount(0);

    const durable = await fetchClassroomAssessment(page, state.assessmentId!);
    expect(durable.data.lifecycle_state).toBe("VOIDED");
    expect(durable.data.voided_at).toBeTruthy();
    expect(durable.data.assessment_id).toBe(state.assessmentId);

    await page.reload();
    await connectDevSession(page);
    await expect(page).toHaveURL(
      new RegExp(`assessment_id=${state.assessmentId}`),
    );
    await expect(
      page.getByRole("region", { name: "Classroom assessment", exact: true }).locator(".lifecycle-pill", { hasText: "VOIDED" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Correct assessment/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Void assessment/i }),
    ).toHaveCount(0);

    const listed = await listClassroomAssessments(page, {
      executionId: state.executionId!,
    });
    expect(listed.some((item) => item.assessment_id === state.assessmentId)).toBe(
      true,
    );
    const voided = listed.find((item) => item.assessment_id === state.assessmentId);
    expect(voided?.lifecycle_state).toBe("VOIDED");
  });
});
