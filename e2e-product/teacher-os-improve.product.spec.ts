import { test, expect } from "@playwright/test";
import {
  apiHeaders,
  artifactPath,
  assertNoApiMocksInstalled,
  assertNoLearnerAssessmentFields,
  calendarDateOnlyLocal,
  connectDevSession,
  DEV_PRINCIPAL_ID,
  fetchClassroomAssessment,
  fetchTeachingExecution,
  fetchTeachingWork,
  listClassroomAssessments,
  listTeachingWorkArtifacts,
  loadProductFixture,
} from "./support/productHarness";

/**
 * TOS-DEV09-I04 Improve real-stack Product E2E.
 * Zero page.route API mocks — all traffic via Vite /api proxy to FastAPI.
 * Self-contained prerequisites (does not rely on other product-spec order).
 *
 * Continuity: COMPLETED TeachingExecution → RECORD assessment → Assess
 * “Improve this class” → Improve goal confirm → remediation TeachingWork → Work.
 */

test.describe.configure({ mode: "serial" });

let fixture: ReturnType<typeof loadProductFixture>;

const RECORD_NOTE =
  "Class still mixed on fraction comparison — teacher chooses remediation.";
const REMEDIATION_GOAL =
  "Rebuild fraction comparison fluency with guided visual models";

const state: {
  assignmentId: string | null;
  executionId: string | null;
  assessmentId: string | null;
  assessmentRevision: number | null;
  remediationWorkId: string | null;
} = {
  assignmentId: null,
  executionId: null,
  assessmentId: null,
  assessmentRevision: null,
  remediationWorkId: null,
};

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

test.describe("TOS-DEV09-I04 Improve Product E2E", () => {
  test.beforeAll(() => {
    fixture = loadProductFixture();
  });

  test.beforeEach(({ page }) => {
    assertNoApiMocksInstalled(page);
  });

  test("Phase A — Publish, assign, START and COMPLETE TeachingExecution", async ({
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
  });

  test("Phase B — RECORD ClassroomAssessment (Assess continuity prerequisite)", async ({
    page,
  }) => {
    const f = fixture;
    expect(state.executionId).toBeTruthy();

    await page.goto(`/teacher-os/teach/executions/${state.executionId}`);
    await connectDevSession(page);
    await page.getByRole("link", { name: /Assess this class/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/teacher-os/assess\\?execution_id=${state.executionId}`),
    );

    await page.getByRole("radio", { name: /^Mixed/i }).check();
    await page.getByLabel("Class result note").fill(RECORD_NOTE);

    const recordResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/v1/assessment/classroom-assessments") &&
        !response.url().includes("/actions/") &&
        response.status() === 201,
    );
    await page.getByRole("button", { name: "Record class assessment" }).click();
    const response = await recordResponse;
    const created = (await response.json()) as {
      assessment_id: string;
      lifecycle_state: string;
      aggregate_revision: number;
      execution_id: string | null;
      work_id: string | null;
      class_ref: string;
      class_result_level: string;
      teacher_principal_id: string;
    };
    expect(created.lifecycle_state).toBe("RECORDED");
    expect(created.execution_id).toBe(state.executionId);
    expect(created.work_id).toBe(f.work_id);
    expect(created.class_ref).toBe("class-5a");
    expect(created.class_result_level).toBe("MIXED");
    expect(created.teacher_principal_id).toBe(DEV_PRINCIPAL_ID);
    assertNoLearnerAssessmentFields(created as unknown as Record<string, unknown>);

    state.assessmentId = created.assessment_id;
    state.assessmentRevision = created.aggregate_revision;

    const durable = await fetchClassroomAssessment(page, state.assessmentId!);
    expect(durable.data.lifecycle_state).toBe("RECORDED");
    expect(durable.data.assessment_id).toBe(state.assessmentId);
    expect(durable.data.aggregate_revision).toBe(state.assessmentRevision);
  });

  test("Phase C — Assess “Improve this class” enters Improve with RECORDED source", async ({
    page,
  }) => {
    expect(state.assessmentId).toBeTruthy();

    await page.goto(`/teacher-os/assess?assessment_id=${state.assessmentId}`);
    await connectDevSession(page);
    await expect(
      page
        .getByRole("region", { name: "Classroom assessment", exact: true })
        .locator(".lifecycle-pill", { hasText: "RECORDED" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Improve this class/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /Improve this class/i }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/teacher-os/improve\\?assessment_id=${state.assessmentId}`,
      ),
    );
    await expect(
      page.getByRole("heading", { name: /Review the source assessment/i }),
    ).toBeVisible();
    await expect(page.getByText(RECORD_NOTE)).toBeVisible();
    await expect(page.getByText(/needs remediation/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Continue to remediation goal/i }),
    ).toBeVisible();
  });

  test("Phase D — Hub lists RECORDED eligibility without implying remediation is required", async ({
    page,
  }) => {
    expect(state.assessmentId).toBeTruthy();

    await page.goto("/teacher-os/improve");
    await connectDevSession(page);
    await expect(page.getByRole("heading", { name: "Improve" })).toBeVisible();
    await expect(
      page.getByText(
        /Eligibility is RECORDED only — not inferred from Demonstrated, Mixed, or Not yet demonstrated/i,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/Choosing Improve is your decision/i),
    ).toBeVisible();
    await expect(page.getByText(/needs remediation/i)).toHaveCount(0);
    await expect(page.getByText(/must improve/i)).toHaveCount(0);

    const listed = await listClassroomAssessments(page, {
      classRef: "class-5a",
      limit: 50,
    });
    const ours = listed.find((item) => item.assessment_id === state.assessmentId);
    expect(ours?.lifecycle_state).toBe("RECORDED");

    await expect(
      page.getByRole("link", { name: /Improve this class/i }).first(),
    ).toBeVisible();
  });

  test("Phase E — Explicit create posts remediation and opens Work page", async ({
    page,
  }) => {
    expect(state.assessmentId).toBeTruthy();
    expect(state.assessmentRevision).not.toBeNull();
    expect(typeof state.assessmentRevision).toBe("number");

    const targetDate = calendarDateOnlyLocal(3);
    const downstreamPosts: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "POST") return;
      const url = request.url();
      if (
        url.includes("/actions/generate") ||
        url.includes("/actions/publish") ||
        url.includes("/api/v1/teaching/assignments") ||
        url.includes("/api/v1/teaching/executions")
      ) {
        downstreamPosts.push(`${request.method()} ${url}`);
      }
    });

    await page.goto(
      `/teacher-os/improve?assessment_id=${state.assessmentId}`,
    );
    await connectDevSession(page);
    await expect(
      page.getByRole("heading", { name: /Review the source assessment/i }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Continue to remediation goal/i })
      .click();
    await page.getByLabel(/Remediation goal/i).fill(REMEDIATION_GOAL);
    await page.getByRole("button", { name: /Continue to context/i }).click();
    await page.getByLabel(/Target date/i).fill(targetDate);
    await page.getByLabel(/^Subject/i).fill("Mathematics");
    await page.getByLabel(/^Topic/i).fill("Fraction comparison");
    await page.getByRole("button", { name: /Continue to confirm/i }).click();
    await expect(
      page.getByText(
        /Creating this starts a remediation preparation\. Nothing is generated, published or assigned yet/i,
      ),
    ).toBeVisible();

    const createRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes(
          "/api/v1/teaching/works/from-classroom-assessment",
        ),
    );
    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(
          "/api/v1/teaching/works/from-classroom-assessment",
        ) &&
        response.status() === 201,
    );
    await page
      .getByRole("button", { name: /Create remediation preparation/i })
      .click();
    const request = await createRequest;
    const response = await createResponse;

    expect(request.headers()["idempotency-key"]).toBeTruthy();
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body).toEqual({
      assessment_id: state.assessmentId,
      expected_assessment_aggregate_revision: state.assessmentRevision,
      goal_text: REMEDIATION_GOAL,
      target_date: targetDate,
      locale: "en-IN",
      subject: "Mathematics",
      topic: "Fraction comparison",
    });
    expect(body).not.toHaveProperty("intent_type");
    expect(body).not.toHaveProperty("class_ref");
    expect(body).not.toHaveProperty("class_result_note");
    expect(body).not.toHaveProperty("class_result_level");

    const created = (await response.json()) as {
      work_id: string;
      intent_type: string;
      goal_text: string;
      subject: string | null;
      topic: string | null;
      target_date: string;
      locale: string;
    };
    expect(created.intent_type).toBe("remediate_class");
    expect(created.goal_text).toBe(REMEDIATION_GOAL);
    expect(created.subject).toBe("Mathematics");
    expect(created.topic).toBe("Fraction comparison");
    expect(created.target_date).toBe(targetDate);
    expect(created.locale).toBe("en-IN");
    state.remediationWorkId = created.work_id;

    await expect(page).toHaveURL(
      new RegExp(`/teacher-os/work/${state.remediationWorkId}`),
    );
    await expect(
      page.getByRole("heading", { name: REMEDIATION_GOAL }),
    ).toBeVisible();
    await expect(page.getByText("Remediate class")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Saved remediation preparation/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Create preparation kit/i }),
    ).toBeVisible();

    expect(downstreamPosts).toEqual([]);
  });

  test("Phase F — Remediation TeachingWork persists; no auto Generate/Publish/Assign/Teach", async ({
    page,
  }) => {
    expect(state.remediationWorkId).toBeTruthy();
    expect(state.assessmentId).toBeTruthy();

    const durable = await fetchTeachingWork(page, state.remediationWorkId!);
    expect(durable.data.work_id).toBe(state.remediationWorkId);
    expect(durable.data.intent_type).toBe("remediate_class");
    expect(durable.data.goal_text).toBe(REMEDIATION_GOAL);
    expect(durable.data.subject).toBe("Mathematics");
    expect(durable.data.topic).toBe("Fraction comparison");
    expect(durable.data.locale).toBe("en-IN");
    expect(durable.data.aggregate_revision).toBe(0);

    const artifacts = await listTeachingWorkArtifacts(
      page,
      state.remediationWorkId!,
    );
    expect(artifacts.work_id).toBe(state.remediationWorkId);
    expect(artifacts.items).toHaveLength(0);

    const source = await fetchClassroomAssessment(page, state.assessmentId!);
    expect(source.data.lifecycle_state).toBe("RECORDED");
    expect(source.data.aggregate_revision).toBe(state.assessmentRevision);

    await page.goto(`/teacher-os/work/${state.remediationWorkId}`);
    await connectDevSession(page);
    await expect(
      page.getByRole("heading", { name: REMEDIATION_GOAL }),
    ).toBeVisible();
    await expect(page.getByText("Remediate class")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Create preparation kit/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Assign to class/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Start lesson/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Publish/i }),
    ).toHaveCount(0);
  });
});
