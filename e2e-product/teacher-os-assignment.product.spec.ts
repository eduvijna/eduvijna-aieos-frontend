import { test, expect } from "@playwright/test";
import {
  apiHeaders,
  artifactPath,
  calendarDateLocal,
  connectDevSession,
  loadProductFixture,
} from "./support/productHarness";

/**
 * TOS-DEV06-I05 real-stack product journey.
 * Zero page.route API mocks — all traffic via Vite /api proxy to FastAPI.
 */

test.describe.configure({ mode: "serial" });

let fixture: ReturnType<typeof loadProductFixture>;

const state: {
  assignment5aId: string | null;
  assignment5bId: string | null;
  publishedVersionId: string | null;
  dueUpdatedAssignmentId: string | null;
  cancelledAssignmentId: string | null;
  priorDueAt: string | null;
  newDueAt: string | null;
} = {
  assignment5aId: null,
  assignment5bId: null,
  publishedVersionId: null,
  dueUpdatedAssignmentId: null,
  cancelledAssignmentId: null,
  priorDueAt: null,
  newDueAt: null,
};

function assertNoApiMocksInstalled(page: import("@playwright/test").Page) {
  const routes = (page as unknown as { _routes?: unknown[] })._routes;
  if (routes && routes.length > 0) {
    throw new Error("Product E2E must not register page.route handlers");
  }
}

async function fetchContent(page: import("@playwright/test").Page) {
  const f = loadProductFixture();
  const response = await page.request.get(
    `/api/v1/contents/${f.content_id}`,
    { headers: apiHeaders() },
  );
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
    content_id: string;
    content_version_id: string;
    class_ref: string;
    audience_display_label: string;
    source_work_id: string | null;
    lifecycle_state: string;
    due_at: string | null;
    cancelled_at: string | null;
    aggregate_revision: number;
  }>;
}

function publishedVersionCode(page: import("@playwright/test").Page) {
  return page.locator("dt", { hasText: "Published version" }).locator("+ dd code");
}

test.describe("TOS-DEV06-I05 Assignment Product E2E", () => {
  test.beforeAll(() => {
    fixture = loadProductFixture();
  });

  test.beforeEach(({ page }) => {
    assertNoApiMocksInstalled(page);
  });

  test("Phase A — Publish approved unpublished worksheet", async ({ page }) => {
    const f = fixture;
    expect(f.published_version_id_before).toBeNull();
    expect(f.stewardship_state).toBe("APPROVED");
    expect(f.content_type).toBe("worksheet");

    await page.goto(artifactPath(f));
    await connectDevSession(page);

    const contentBefore = await fetchContent(page);
    if (contentBefore.published_version_id === f.version_id) {
      await expect(publishedVersionCode(page)).toHaveText(f.version_id);
      await expect(page.getByRole("button", { name: "Assign to class" })).toBeVisible();
      state.publishedVersionId = contentBefore.published_version_id;
      return;
    }

    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Assign to class" }),
    ).toHaveCount(0);
    await expect(publishedVersionCode(page)).toHaveText("none");

    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByText(/Published\. This version is now the published pointer/i),
    ).toBeVisible();

    await expect(publishedVersionCode(page)).toHaveText(f.version_id);
    await expect(page.getByRole("button", { name: "Assign to class" })).toBeVisible();

    const content = await fetchContent(page);
    expect(content.published_version_id).toBe(f.version_id);
    state.publishedVersionId = content.published_version_id;

    await page.reload();
    await connectDevSession(page);
    await expect(page.getByRole("button", { name: "Assign to class" })).toBeVisible();
    const afterReload = await fetchContent(page);
    expect(afterReload.published_version_id).toBe(f.version_id);
  });

  test("Phase B — First assignment to Grade 5A", async ({ page }) => {
    const f = fixture;

    await page.goto(artifactPath(f));
    await connectDevSession(page);
    await page.getByRole("button", { name: "Assign to class" }).click();
    await expect(
      page.getByRole("heading", { name: "Assign to class" }),
    ).toBeVisible();
    const classSelect = page.getByRole("combobox", { name: "Class" });
    await expect(classSelect).toBeVisible();
    await expect(classSelect.locator("option", { hasText: "Grade 5A" })).toHaveCount(1);
    await expect(classSelect.locator("option", { hasText: "Grade 5B" })).toHaveCount(1);

    await classSelect.selectOption("class-5a");
    const createRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/v1/teaching/assignments"),
    );
    await page.getByRole("button", { name: "Create assignment" }).click();
    const request = await createRequest;
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body).toEqual({
      content_id: f.content_id,
      content_version_id: f.version_id,
      class_ref: "class-5a",
      source_work_id: f.work_id,
    });
    expect(body).not.toHaveProperty("tenant_id");
    expect(body).not.toHaveProperty("teacher_principal_id");
    expect(body).not.toHaveProperty("audience_display_label");
    expect(body).not.toHaveProperty("lifecycle_state");

    await expect(
      page.getByRole("heading", { name: "Assignment created" }),
    ).toBeVisible();
    await expect(
      page.getByText(/does not mean learners received it/i),
    ).toBeVisible();

    const listResponse = await page.request.get("/api/v1/teaching/assignments", {
      headers: apiHeaders(),
    });
    const list = (await listResponse.json()) as {
      items: Array<{ assignment_id: string; class_ref: string; lifecycle_state: string }>;
    };
    const created = list.items.find((item) => item.class_ref === "class-5a");
    expect(created).toBeTruthy();
    state.assignment5aId = created!.assignment_id;

    const assignment = await fetchAssignment(page, state.assignment5aId!);
    expect(assignment.lifecycle_state).toBe("ACTIVE");
    expect(assignment.content_id).toBe(f.content_id);
    expect(assignment.content_version_id).toBe(f.version_id);
    expect(assignment.class_ref).toBe("class-5a");
    expect(assignment.source_work_id).toBe(f.work_id);
  });

  test("Phase C — Reload durability for Grade 5A assignment", async ({ page }) => {
    const f = fixture;
    expect(state.assignment5aId).toBeTruthy();

    await page.goto("/teacher-os/teach");
    await connectDevSession(page);
    await expect(page.getByRole("link", { name: "Grade 5A" }).first()).toBeVisible();

    await page.reload();
    await connectDevSession(page);
    await expect(page.getByRole("link", { name: "Grade 5A" }).first()).toBeVisible();

    await page.getByRole("link", { name: "Grade 5A" }).first().click();
    await expect(page.locator("code", { hasText: state.assignment5aId! }).first()).toBeVisible();
    await expect(page.locator(".lifecycle-pill", { hasText: "ACTIVE" }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: f.content_id }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: f.version_id }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Grade 5A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open artifact" })).toBeVisible();

    const assignment = await fetchAssignment(page, state.assignment5aId!);
    expect(assignment.source_work_id).toBe(f.work_id);
  });

  test("Phase D — Independent assignment to Grade 5B", async ({ page }) => {
    const f = fixture;
    await page.goto(artifactPath(f));
    await connectDevSession(page);
    await page.getByRole("button", { name: "Assign to class" }).click();
    await page.getByRole("combobox", { name: "Class" }).selectOption("class-5b");
    await page.getByRole("button", { name: "Create assignment" }).click();
    await expect(
      page.getByRole("heading", { name: "Assignment created" }),
    ).toBeVisible();

    const listResponse = await page.request.get("/api/v1/teaching/assignments", {
      headers: apiHeaders(),
    });
    const list = (await listResponse.json()) as {
      items: Array<{ assignment_id: string; class_ref: string }>;
    };
    const a = list.items.find((item) => item.class_ref === "class-5a");
    const b = list.items.find((item) => item.class_ref === "class-5b");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    state.assignment5aId = a!.assignment_id;
    state.assignment5bId = b!.assignment_id;
    expect(state.assignment5aId).not.toBe(state.assignment5bId);

    const assignmentB = await fetchAssignment(page, state.assignment5bId!);
    expect(assignmentB.content_id).toBe(f.content_id);
    expect(assignmentB.content_version_id).toBe(f.version_id);
    expect(assignmentB.class_ref).toBe("class-5b");

    await page.goto("/teacher-os/teach");
    await connectDevSession(page);
    await expect(page.getByRole("link", { name: "Grade 5A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Grade 5B" })).toBeVisible();
  });

  test("Phase E — Due date update persists", async ({ page }) => {
    const targetId = state.assignment5aId!;
    state.dueUpdatedAssignmentId = targetId;
    const otherId = state.assignment5bId!;
    const newDueLocal = calendarDateLocal(14);

    const before = await fetchAssignment(page, targetId);
    state.priorDueAt = before.due_at;

    await page.goto(`/teacher-os/teach/assignments/${targetId}`);
    await connectDevSession(page);
    await page.getByLabel(/Due date/i).fill(newDueLocal);
    await page.getByRole("button", { name: "Update due date" }).click();
    await expect(page.getByText(/Due date updated/i)).toBeVisible();

    const after = await fetchAssignment(page, targetId);
    expect(after.due_at).toBeTruthy();
    state.newDueAt = after.due_at;

    await page.reload();
    await connectDevSession(page);
    await expect(page.getByText(/Due date updated|Updating due date/i)).not.toBeVisible();
    const reloaded = await fetchAssignment(page, targetId);
    expect(reloaded.due_at).toBe(state.newDueAt);

    await page.goto("/teacher-os/teach");
    await connectDevSession(page);
    await page.getByRole("link", { name: "Grade 5B" }).click();
    const other = await fetchAssignment(page, otherId);
    expect(other.due_at).not.toBe(state.newDueAt);
  });

  test("Phase F — Cancel one assignment; other stays ACTIVE", async ({ page }) => {
    const cancelId = state.assignment5aId!;
    const keepActiveId = state.assignment5bId!;
    state.cancelledAssignmentId = cancelId;

    const before = await fetchAssignment(page, cancelId);
    expect(before.lifecycle_state).toBe("ACTIVE");

    await page.goto(`/teacher-os/teach/assignments/${cancelId}`);
    await connectDevSession(page);
    await page.getByRole("button", { name: "Cancel assignment" }).click();
    await page.getByRole("button", { name: "Confirm cancel" }).click();
    await expect(page.getByText(/Assignment cancelled/i)).toBeVisible();
    await expect(
      page.locator(".lifecycle-pill", { hasText: "CANCELLED" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Update due date" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close assignment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel assignment" })).toHaveCount(0);

    const cancelled = await fetchAssignment(page, cancelId);
    expect(cancelled.lifecycle_state).toBe("CANCELLED");
    expect(cancelled.cancelled_at).toBeTruthy();

    await page.reload();
    await connectDevSession(page);
    await expect(
      page.locator(".lifecycle-pill", { hasText: "CANCELLED" }),
    ).toBeVisible();

    const other = await fetchAssignment(page, keepActiveId);
    expect(other.lifecycle_state).toBe("ACTIVE");

    await page.goto("/teacher-os/teach");
    await connectDevSession(page);
    await expect(page.getByRole("link", { name: "Grade 5B" })).toBeVisible();
    await expect(
      page.getByText("Assigned ≠ Taught ≠ Assessed ≠ Mastered"),
    ).toBeVisible();
    const pageText = await page.locator("body").textContent();
    const forbiddenClaims = [
      /sent to students/i,
      /delivered to learners/i,
      /learners notified/i,
      /LMS published/i,
      /learner receipt/i,
      /roster snapshot/i,
      /submitted to/i,
      /has been graded/i,
    ];
    for (const pattern of forbiddenClaims) {
      expect(pageText ?? "").not.toMatch(pattern);
    }
  });
});

export { state };
