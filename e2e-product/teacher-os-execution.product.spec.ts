import { test, expect } from "@playwright/test";
import {
  apiHeaders,
  artifactPath,
  assertNoLearnerExecutionFields,
  connectDevSession,
  DEV_PRINCIPAL_ID,
  fetchTeachingExecution,
  loadProductFixture,
} from "./support/productHarness";

/**
 * TOS-DEV07-I04 TeachingExecution real-stack product journey.
 * Zero page.route API mocks — all traffic via Vite /api proxy to FastAPI.
 * Self-contained prerequisites (does not rely on Assignment spec order).
 */

test.describe.configure({ mode: "serial" });

let fixture: ReturnType<typeof loadProductFixture>;

const state: {
  assignment5aId: string | null;
  assignmentLifecycleBeforeComplete: string | null;
  execution5aId: string | null;
  startedAt: string | null;
  aggregateRevisionAtStart: number | null;
  privateObservationId: string | null;
  classObservationId: string | null;
  execution5bId: string | null;
} = {
  assignment5aId: null,
  assignmentLifecycleBeforeComplete: null,
  execution5aId: null,
  startedAt: null,
  aggregateRevisionAtStart: null,
  privateObservationId: null,
  classObservationId: null,
  execution5bId: null,
};

const PRIVATE_NOTE =
  "Teacher noted that fraction comparison needed one more example.";
const PRIVATE_NOTE_CORRECTED =
  "Teacher noted that fraction comparison needed two more examples.";
const CLASS_NOTE = "Class responded well to the visual fraction model.";

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

async function fetchAssignment(
  page: import("@playwright/test").Page,
  assignmentId: string,
) {
  const response = await page.request.get(
    `/api/v1/teaching/assignments/${assignmentId}`,
    { headers: apiHeaders() },
  );
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{
    assignment_id: string;
    lifecycle_state: string;
    class_ref: string;
    content_id: string;
    content_version_id: string;
    source_work_id: string | null;
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

async function ensureActiveAssignment5a(
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

test.describe("TOS-DEV07-I04 TeachingExecution Product E2E", () => {
  test.beforeAll(() => {
    fixture = loadProductFixture();
  });

  test.beforeEach(({ page }) => {
    assertNoApiMocksInstalled(page);
  });

  test("Phase A — Open Teach workspace and load teach context", async ({
    page,
  }) => {
    const f = fixture;
    await ensurePublishedExactVersion(page);
    state.assignment5aId = await ensureActiveAssignment5a(page);

    await page.goto("/teacher-os/teach");
    await connectDevSession(page);

    await expect(
      page.getByRole("heading", { name: "Teaching workspace" }),
    ).toBeVisible();
    await expect(
      page.getByText("Assigned ≠ Taught ≠ Assessed ≠ Mastered"),
    ).toBeVisible();

    await page
      .getByRole("combobox", { name: "Teaching work" })
      .selectOption(f.work_id);
    await page.getByRole("combobox", { name: "Class" }).selectOption("class-5a");

    await expect(
      page.getByRole("heading", { name: "Teach context" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Teach context" })
        .getByText(f.scenario_marker ?? /TOS-DEV07-I04/),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Teach context" }).getByText("Grade 5A"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Teach context" })
        .locator("code", { hasText: "class-5a" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Teach context" })
        .getByText("Mathematics"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Teach context" })
        .getByText("Comparing fractions"),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Bind Fractions Worksheet" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Grade 5A" }).first()).toBeVisible();
  });

  test("Phase B — START TeachingExecution with exact worksheet binding", async ({
    page,
  }) => {
    const f = fixture;
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

    const startRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/v1/teaching/executions") &&
        !request.url().includes("/observations") &&
        !request.url().includes("/actions/"),
    );
    await page.getByRole("button", { name: "Start lesson" }).click();
    const request = await startRequest;
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body.work_id).toBe(f.work_id);
    expect(body.class_ref).toBe("class-5a");
    expect(Array.isArray(body.bindings)).toBeTruthy();
    expect(body.bindings).toEqual([
      {
        content_id: f.content_id,
        content_version_id: f.version_id,
        artifact_kind: "worksheet",
      },
    ]);
    expect(body).not.toHaveProperty("tenant_id");
    expect(body).not.toHaveProperty("teacher_principal_id");
    expect(body).not.toHaveProperty("teacher_id");
    expect(body).not.toHaveProperty("started_at");
    expect(body).not.toHaveProperty("lifecycle_state");
    expect(body).not.toHaveProperty("assignment_id");
    expect(body).not.toHaveProperty("learner_id");
    expect(body).not.toHaveProperty("student_id");
    expect(request.headers()["idempotency-key"]).toBeTruthy();

    await expect(page).toHaveURL(/\/teacher-os\/teach\/executions\/[^/]+$/);
    await expect(
      page.locator(".lifecycle-pill", { hasText: "IN_PROGRESS" }),
    ).toBeVisible();
    await expect(page.locator("code", { hasText: f.work_id }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: "class-5a" }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: f.content_id }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: f.version_id }).first()).toBeVisible();
    await expect(page.getByText("worksheet").first()).toBeVisible();

    const match = page.url().match(/\/executions\/([^/]+)$/);
    expect(match?.[1]).toBeTruthy();
    state.execution5aId = match![1];

    const durable = await fetchTeachingExecution(page, state.execution5aId!);
    expect(durable.execution_id).toBe(state.execution5aId);
    expect(durable.lifecycle_state).toBe("IN_PROGRESS");
    expect(durable.work_id).toBe(f.work_id);
    expect(durable.class_ref).toBe("class-5a");
    expect(durable.teacher_principal_id).toBe(DEV_PRINCIPAL_ID);
    expect(durable.bindings).toEqual([
      {
        content_id: f.content_id,
        content_version_id: f.version_id,
        artifact_kind: "worksheet",
      },
    ]);
    assertNoLearnerExecutionFields(durable as unknown as Record<string, unknown>);
    state.startedAt = durable.started_at;
    state.aggregateRevisionAtStart = durable.aggregate_revision;
  });

  test("Phase C — Durable reload preserves execution binding truth", async ({
    page,
  }) => {
    const f = fixture;
    expect(state.execution5aId).toBeTruthy();

    await page.goto(`/teacher-os/teach/executions/${state.execution5aId}`);
    await connectDevSession(page);
    await expect(
      page.locator(".lifecycle-pill", { hasText: "IN_PROGRESS" }),
    ).toBeVisible();

    await page.reload();
    await connectDevSession(page);
    await expect(
      page.locator(".lifecycle-pill", { hasText: "IN_PROGRESS" }),
    ).toBeVisible();
    await expect(page.locator("code", { hasText: state.execution5aId! })).toBeVisible();
    await expect(page.locator("code", { hasText: f.work_id }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: "class-5a" }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: f.content_id }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: f.version_id }).first()).toBeVisible();

    const durable = await fetchTeachingExecution(page, state.execution5aId!);
    expect(durable.execution_id).toBe(state.execution5aId);
    expect(durable.teacher_principal_id).toBe(DEV_PRINCIPAL_ID);
    expect(durable.work_id).toBe(f.work_id);
    expect(durable.class_ref).toBe("class-5a");
    expect(durable.lifecycle_state).toBe("IN_PROGRESS");
    expect(durable.started_at).toBe(state.startedAt);
    expect(durable.aggregate_revision).toBe(state.aggregateRevisionAtStart);
    expect(durable.bindings[0]?.content_id).toBe(f.content_id);
    expect(durable.bindings[0]?.content_version_id).toBe(f.version_id);
    expect(durable.bindings[0]?.artifact_kind).toBe("worksheet");
    assertNoLearnerExecutionFields(durable as unknown as Record<string, unknown>);
  });

  test("Phase D — Private execution note", async ({ page }) => {
    expect(state.execution5aId).toBeTruthy();
    await page.goto(`/teacher-os/teach/executions/${state.execution5aId}`);
    await connectDevSession(page);

    await page
      .getByRole("combobox", { name: "Observation kind" })
      .selectOption({ label: "Private execution note" });
    await page.getByLabel("Observation note").fill(PRIVATE_NOTE);

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .includes(
            `/api/v1/teaching/executions/${state.execution5aId}/observations`,
          ) &&
        response.ok(),
    );
    await page.getByRole("button", { name: "Record observation" }).click();
    const createResponse = await createResponsePromise;
    const request = createResponse.request();
    expect(request.headers()["idempotency-key"]).toBeTruthy();
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body).toEqual({
      observation_kind: "PRIVATE_EXECUTION_NOTE",
      body: PRIVATE_NOTE,
    });

    await expect(page.getByText(/Observation recorded/i)).toBeVisible();
    await expect(page.getByText(PRIVATE_NOTE)).toBeVisible();
    await expect(page.getByText(/rev 0/).first()).toBeVisible();

    const durable = await fetchTeachingExecution(page, state.execution5aId!);
    const note = durable.observations.find(
      (item) => item.observation_kind === "PRIVATE_EXECUTION_NOTE",
    );
    expect(note).toBeTruthy();
    expect(note!.revision).toBe(0);
    expect(note!.body).toBe(PRIVATE_NOTE);
    assertNoLearnerExecutionFields(note as unknown as Record<string, unknown>);
    state.privateObservationId = note!.observation_id;

    await page.reload();
    await connectDevSession(page);
    await expect(page.getByText(PRIVATE_NOTE)).toBeVisible();
  });

  test("Phase E — Class observation", async ({ page }) => {
    expect(state.execution5aId).toBeTruthy();
    await page.goto(`/teacher-os/teach/executions/${state.execution5aId}`);
    await connectDevSession(page);

    await page
      .getByRole("combobox", { name: "Observation kind" })
      .selectOption({ label: "Class observation" });
    await expect(
      page.getByRole("combobox", { name: "Observation kind" }),
    ).toHaveValue("CLASS_OBSERVATION");
    await page.getByLabel("Observation note").fill(CLASS_NOTE);

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .includes(
            `/api/v1/teaching/executions/${state.execution5aId}/observations`,
          ) &&
        response.ok(),
    );
    await page.getByRole("button", { name: "Record observation" }).click();
    const createResponse = await createResponsePromise;
    const request = createResponse.request();
    expect(request.headers()["idempotency-key"]).toBeTruthy();
    expect(request.postDataJSON()).toEqual({
      observation_kind: "CLASS_OBSERVATION",
      body: CLASS_NOTE,
    });
    const created = (await createResponse.json()) as {
      observation_id: string;
      observation_kind: string;
      body: string;
      revision: number;
    };
    expect(created.observation_kind).toBe("CLASS_OBSERVATION");
    expect(created.body).toBe(CLASS_NOTE);
    expect(created.revision).toBe(0);

    await expect(page.getByText(/Observation recorded/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Class observation" }),
    ).toBeVisible();
    await expect(page.getByText(CLASS_NOTE)).toBeVisible();

    const durable = await fetchTeachingExecution(page, state.execution5aId!);
    const classObs = durable.observations.find(
      (item) => item.observation_kind === "CLASS_OBSERVATION",
    );
    expect(classObs).toBeTruthy();
    expect(classObs!.observation_id).not.toBe(state.privateObservationId);
    expect(classObs!.revision).toBe(0);
    expect(classObs!.body).toBe(CLASS_NOTE);
    assertNoLearnerExecutionFields(classObs as unknown as Record<string, unknown>);
    state.classObservationId = classObs!.observation_id;

    await page.reload();
    await connectDevSession(page);
    await expect(page.getByText(CLASS_NOTE)).toBeVisible();
    await expect(page.getByText(PRIVATE_NOTE)).toBeVisible();
  });

  test("Phase F — Correct private observation with If-Match", async ({
    page,
  }) => {
    expect(state.execution5aId).toBeTruthy();
    expect(state.privateObservationId).toBeTruthy();

    await page.goto(`/teacher-os/teach/executions/${state.execution5aId}`);
    await connectDevSession(page);

    const privateCard = page
      .locator("li")
      .filter({ hasText: PRIVATE_NOTE })
      .first();
    await privateCard.getByRole("button", { name: "Correct" }).click();
    const draft = page.getByLabel("Corrected observation text");
    await draft.fill(PRIVATE_NOTE_CORRECTED);
    await expect(draft).toHaveValue(PRIVATE_NOTE_CORRECTED);

    const patchResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response
          .url()
          .includes(`/observations/${state.privateObservationId}`) &&
        response.ok(),
    );
    await page.getByRole("button", { name: "Save correction" }).click();
    const patchResponse = await patchResponsePromise;
    const request = patchResponse.request();
    expect(request.headers()["if-match"]).toMatch(/^"r0"$/);
    expect(request.headers()["idempotency-key"]).toBeTruthy();
    expect(request.postDataJSON()).toEqual({ body: PRIVATE_NOTE_CORRECTED });
    const patched = (await patchResponse.json()) as {
      observation_id: string;
      body: string;
      revision: number;
    };
    expect(patched.observation_id).toBe(state.privateObservationId);
    expect(patched.body).toBe(PRIVATE_NOTE_CORRECTED);
    expect(patched.revision).toBe(1);

    await expect(page.getByText(/Observation corrected/i)).toBeVisible();
    await expect(page.getByText(PRIVATE_NOTE_CORRECTED)).toBeVisible();
    await expect(page.getByText(CLASS_NOTE)).toBeVisible();

    const durable = await fetchTeachingExecution(page, state.execution5aId!);
    const privateObs = durable.observations.find(
      (item) => item.observation_id === state.privateObservationId,
    );
    const classObs = durable.observations.find(
      (item) => item.observation_id === state.classObservationId,
    );
    expect(privateObs?.body).toBe(PRIVATE_NOTE_CORRECTED);
    expect(privateObs?.revision).toBe(1);
    expect(classObs?.body).toBe(CLASS_NOTE);
    expect(classObs?.revision).toBe(0);

    await page.reload();
    await connectDevSession(page);
    await expect(page.getByText(PRIVATE_NOTE_CORRECTED)).toBeVisible();
    await expect(page.getByText(/rev 1/).first()).toBeVisible();
  });

  test("Phase G — Complete lesson with If-Match", async ({ page }) => {
    expect(state.execution5aId).toBeTruthy();
    expect(state.assignment5aId).toBeTruthy();

    const assignmentBefore = await fetchAssignment(page, state.assignment5aId!);
    state.assignmentLifecycleBeforeComplete = assignmentBefore.lifecycle_state;
    expect(state.assignmentLifecycleBeforeComplete).toBe("ACTIVE");

    await page.goto(`/teacher-os/teach/executions/${state.execution5aId}`);
    await connectDevSession(page);

    await page.getByRole("button", { name: "Complete lesson" }).click();
    const completeRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(
            `/api/v1/teaching/executions/${state.execution5aId}/actions/complete`,
          ),
    );
    await page.getByRole("button", { name: "Confirm complete" }).click();
    const request = await completeRequest;
    expect(request.headers()["if-match"]).toMatch(/^"r\d+"$/);
    expect(request.headers()["idempotency-key"]).toBeTruthy();

    await expect(
      page.locator(".lifecycle-pill", { hasText: "COMPLETED" }),
    ).toBeVisible();
    await expect(
      page.getByText(/does NOT mean|does not mean|not assignment complete/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record observation" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Correct" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Complete lesson" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cancel lesson" }),
    ).toHaveCount(0);

    const durable = await fetchTeachingExecution(page, state.execution5aId!);
    expect(durable.lifecycle_state).toBe("COMPLETED");
    expect(durable.completed_at).toBeTruthy();
    expect(durable.cancelled_at).toBeNull();

    await page.reload();
    await connectDevSession(page);
    await expect(
      page.locator(".lifecycle-pill", { hasText: "COMPLETED" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).toContainText(/Completed/i);
    await expect(
      page
        .locator("p.muted")
        .filter({ hasText: "Assigned ≠ Taught ≠ Assessed ≠ Mastered" })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText(/does not mutate related TeachingAssignments/i),
    ).toBeVisible();
  });

  test("Phase H — Assignment independence after execution complete", async ({
    page,
  }) => {
    expect(state.assignment5aId).toBeTruthy();
    const assignment = await fetchAssignment(page, state.assignment5aId!);
    expect(assignment.lifecycle_state).toBe(
      state.assignmentLifecycleBeforeComplete,
    );
    expect(assignment.lifecycle_state).toBe("ACTIVE");
    expect(assignment.lifecycle_state).not.toBe("CLOSED");
    expect(assignment.lifecycle_state).not.toBe("CANCELLED");
  });

  test("Phase I — Independent zero-binding cancel on class-5b", async ({
    page,
  }) => {
    const f = fixture;
    await page.goto("/teacher-os/teach");
    await connectDevSession(page);
    await page
      .getByRole("combobox", { name: "Teaching work" })
      .selectOption(f.work_id);
    await page.getByRole("combobox", { name: "Class" }).selectOption("class-5b");
    await expect(page.getByRole("combobox", { name: "Class" })).toHaveValue(
      "class-5b",
    );
    await expect(
      page.getByRole("heading", { name: "Teach context" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Teach context" })
        .locator("code", { hasText: "class-5b" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Teach context" }).getByText("Grade 5B"),
    ).toBeVisible();

    const startRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/v1/teaching/executions") &&
        !request.url().includes("/observations") &&
        !request.url().includes("/actions/"),
    );
    await page.getByRole("button", { name: "Start lesson" }).click();
    const start = await startRequest;
    const startBody = start.postDataJSON() as {
      class_ref: string;
      bindings: unknown[];
    };
    expect(startBody.class_ref).toBe("class-5b");
    expect(startBody.bindings).toEqual([]);
    expect(start.headers()["idempotency-key"]).toBeTruthy();

    await expect(page).toHaveURL(/\/teacher-os\/teach\/executions\/[^/]+$/);
    const match = page.url().match(/\/executions\/([^/]+)$/);
    expect(match?.[1]).toBeTruthy();
    state.execution5bId = match![1];
    expect(state.execution5bId).not.toBe(state.execution5aId);

    await page.getByRole("button", { name: "Cancel lesson" }).click();
    const cancelRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(
            `/api/v1/teaching/executions/${state.execution5bId}/actions/cancel`,
          ),
    );
    await page.getByRole("button", { name: "Confirm cancel" }).click();
    const cancel = await cancelRequest;
    expect(cancel.headers()["if-match"]).toMatch(/^"r\d+"$/);
    expect(cancel.headers()["idempotency-key"]).toBeTruthy();

    await expect(
      page.locator(".lifecycle-pill", { hasText: "CANCELLED" }),
    ).toBeVisible();

    const cancelled = await fetchTeachingExecution(page, state.execution5bId!);
    expect(cancelled.lifecycle_state).toBe("CANCELLED");
    expect(cancelled.cancelled_at).toBeTruthy();
    expect(cancelled.completed_at).toBeNull();
    expect(cancelled.bindings).toEqual([]);

    const completed = await fetchTeachingExecution(page, state.execution5aId!);
    expect(completed.lifecycle_state).toBe("COMPLETED");

    await page.reload();
    await connectDevSession(page);
    await expect(
      page.locator(".lifecycle-pill", { hasText: "CANCELLED" }),
    ).toBeVisible();
  });

  test("Phase J — Invalid ClassRef fail-closed (no commit)", async ({
    page,
  }) => {
    const f = fixture;
    const invalidClassRef = "class-not-assignable-xyz";
    const response = await page.request.post("/api/v1/teaching/executions", {
      headers: {
        ...apiHeaders({
          "Idempotency-Key": crypto.randomUUID(),
          "Content-Type": "application/json",
        }),
      },
      data: {
        work_id: f.work_id,
        class_ref: invalidClassRef,
        bindings: [],
      },
    });
    expect(response.status()).toBe(403);
    const problem = (await response.json()) as { code?: string; title?: string };
    expect(problem.code).toBe("class_ref_not_assignable");

    const listResponse = await page.request.get("/api/v1/teaching/executions", {
      headers: apiHeaders(),
      params: {
        work_id: f.work_id,
        class_ref: invalidClassRef,
        limit: 100,
      },
    });
    expect(listResponse.ok()).toBeTruthy();
    const list = (await listResponse.json()) as { items: unknown[] };
    expect(list.items).toHaveLength(0);
  });

  test("Phase K — Historical binding durability after completion", async ({
    page,
  }) => {
    const f = fixture;
    expect(state.execution5aId).toBeTruthy();
    const durable = await fetchTeachingExecution(page, state.execution5aId!);
    expect(durable.lifecycle_state).toBe("COMPLETED");
    expect(durable.bindings).toEqual([
      {
        content_id: f.content_id,
        content_version_id: f.version_id,
        artifact_kind: "worksheet",
      },
    ]);
  });
});
