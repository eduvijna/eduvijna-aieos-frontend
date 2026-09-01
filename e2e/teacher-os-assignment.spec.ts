import { test, expect, type Page } from "@playwright/test";

const WORK_ID = "33333333-3333-3333-3333-333333333333";
const CONTENT_ID = "11111111-1111-1111-1111-111111111111";
const VERSION_ID = "22222222-2222-2222-2222-222222222222";
const LESSON_CONTENT_ID = "12121212-1212-1212-1212-121212121212";
const LESSON_VERSION_ID = "13131313-1313-1313-1313-131313131313";
const ASSIGNMENT_ID = "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa";

async function connectDevSession(page: Page) {
  if (!page.url().includes("/teacher-os/")) {
    await page.goto("/teacher-os/today");
  }
  const details = page.locator("details").filter({
    has: page.locator("summary", { hasText: /DEV session/i }),
  });
  await details.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await page.locator('input[name="tenantId"]').fill("tenant-e2e");
  await page.locator('input[name="bearerToken"]').fill("e2e-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(/Connected \(memory only/i)).toBeVisible();
}

function assignmentBody(overrides: Record<string, unknown> = {}) {
  return {
    assignment_id: ASSIGNMENT_ID,
    teacher_principal_id: "bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb",
    content_id: CONTENT_ID,
    content_version_id: VERSION_ID,
    audience_type: "class",
    class_ref: "class-5a",
    audience_display_label: "Grade 5A",
    source_work_id: WORK_ID,
    lifecycle_state: "ACTIVE",
    assigned_at: "2026-09-01T10:00:00Z",
    available_from: "2026-09-01T10:00:00Z",
    due_at: "2026-09-08T10:00:00Z",
    closed_at: null,
    cancelled_at: null,
    aggregate_revision: 0,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

test.describe("TOS-DEV06-I04 Assignment UX", () => {
  test("E2E A — published worksheet → assignment created", async ({ page }) => {
    const creates: Array<Record<string, unknown>> = [];

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (method === "GET" && url.includes(`/contents/${CONTENT_ID}/versions/`)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            content_id: CONTENT_ID,
            version_id: VERSION_ID,
            version_number: 1,
            schema_id: "worksheet",
            schema_version: 1,
            payload: { prompt: "Name one part of a leaf" },
            payload_sha256: "abc",
            origin: "AI",
            parent_version_id: null,
            created_at: "2026-09-01T09:00:00Z",
          }),
        });
        return;
      }
      if (method === "GET" && url.includes(`/contents/${CONTENT_ID}`)) {
        await route.fulfill({
          status: 200,
          headers: { ETag: '"r3"', "Content-Type": "application/json" },
          body: JSON.stringify({
            content_id: CONTENT_ID,
            content_type: "worksheet",
            title: "E2E worksheet",
            description: "draft",
            locale: "en-IN",
            stewardship_state: "APPROVED",
            current_version_id: VERSION_ID,
            published_version_id: VERSION_ID,
            aggregate_revision: 3,
            created_at: "2026-09-01T08:00:00Z",
            updated_at: "2026-09-01T09:00:00Z",
            archived_at: null,
          }),
        });
        return;
      }
      if (url.includes("/teacher-os/school-context/classes")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              { class_ref: "class-5a", display_label: "Grade 5A" },
              { class_ref: "class-5b", display_label: "Grade 5B" },
            ],
          }),
        });
        return;
      }
      if (method === "POST" && url.endsWith("/api/v1/teaching/assignments")) {
        const body = request.postDataJSON() as Record<string, unknown>;
        creates.push(body);
        await route.fulfill({
          status: 201,
          headers: { ETag: '"r0"', "Content-Type": "application/json" },
          body: JSON.stringify(assignmentBody()),
        });
        return;
      }
      if (method === "GET" && url.endsWith("/api/v1/teaching/assignments")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [assignmentBody()],
            has_more: false,
          }),
        });
        return;
      }
      if (
        method === "GET" &&
        url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        await route.fulfill({
          status: 200,
          headers: { ETag: '"r0"', "Content-Type": "application/json" },
          body: JSON.stringify(assignmentBody()),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ title: "Not Found", status: 404 }),
      });
    });

    await page.goto(
      `/teacher-os/work/${WORK_ID}/artifacts/${CONTENT_ID}/versions/${VERSION_ID}`,
    );
    await connectDevSession(page);
    await expect(page.getByRole("button", { name: "Assign to class" })).toBeVisible();
    await page.getByRole("button", { name: "Assign to class" }).click();
    await expect(
      page.getByRole("heading", { name: "Assign to class" }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Class" }).selectOption("class-5a");
    await page.getByRole("button", { name: "Create assignment" }).click();
    await expect(page.getByRole("heading", { name: "Assignment created" })).toBeVisible();
    expect(creates).toHaveLength(1);
    expect(creates[0]).toEqual({
      content_id: CONTENT_ID,
      content_version_id: VERSION_ID,
      class_ref: "class-5a",
      source_work_id: WORK_ID,
    });
    expect(creates[0]).not.toHaveProperty("tenant_id");
    expect(creates[0]).not.toHaveProperty("teacher_principal_id");
    expect(creates[0]).not.toHaveProperty("audience_display_label");
    await page.getByRole("link", { name: "View in Teach" }).click();
    await expect(
      page.getByRole("heading", { name: "Grade 5A" }),
    ).toBeVisible();
  });

  test("E2E B — teacher-only artifact hides Assign", async ({ page }) => {
    await page.route("**/api/v1/**", async (route) => {
      const url = route.request().url();
      if (url.includes(`/contents/${LESSON_CONTENT_ID}/versions/`)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            content_id: LESSON_CONTENT_ID,
            version_id: LESSON_VERSION_ID,
            version_number: 1,
            schema_id: "lesson_plan",
            schema_version: 1,
            payload: { objective: "Teach photosynthesis" },
            payload_sha256: "abc",
            origin: "AI",
            parent_version_id: null,
            created_at: "2026-09-01T09:00:00Z",
          }),
        });
        return;
      }
      if (url.includes(`/contents/${LESSON_CONTENT_ID}`)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            content_id: LESSON_CONTENT_ID,
            content_type: "lesson_plan",
            title: "E2E lesson plan",
            description: "draft",
            locale: "en-IN",
            stewardship_state: "APPROVED",
            current_version_id: LESSON_VERSION_ID,
            published_version_id: LESSON_VERSION_ID,
            aggregate_revision: 3,
            created_at: "2026-09-01T08:00:00Z",
            updated_at: "2026-09-01T09:00:00Z",
            archived_at: null,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ title: "Not Found", status: 404 }),
      });
    });

    await page.goto(
      `/teacher-os/work/${WORK_ID}/artifacts/${LESSON_CONTENT_ID}/versions/${LESSON_VERSION_ID}`,
    );
    await connectDevSession(page);
    await expect(page.getByRole("heading", { name: "E2E lesson plan" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Assign to class" }),
    ).toHaveCount(0);
  });

  test("E2E C — Teach lifecycle due update then close", async ({ page }) => {
    let assignment = assignmentBody();
    let etag = '"r0"';
    const patches: Array<{ headers: Record<string, string>; body: unknown }> = [];
    const closes: Array<Record<string, string>> = [];

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (method === "GET" && url.endsWith("/api/v1/teaching/assignments")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [assignment], has_more: false }),
        });
        return;
      }
      if (
        method === "GET" &&
        url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        await route.fulfill({
          status: 200,
          headers: { ETag: etag, "Content-Type": "application/json" },
          body: JSON.stringify(assignment),
        });
        return;
      }
      if (
        method === "PATCH" &&
        url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        patches.push({
          headers: {
            "If-Match": request.headers()["if-match"] ?? "",
            "Idempotency-Key": request.headers()["idempotency-key"] ?? "",
          },
          body: request.postDataJSON(),
        });
        assignment = assignmentBody({
          due_at: null,
          aggregate_revision: 1,
        });
        etag = '"r1"';
        await route.fulfill({
          status: 200,
          headers: { ETag: etag, "Content-Type": "application/json" },
          body: JSON.stringify(assignment),
        });
        return;
      }
      if (method === "POST" && url.endsWith("/actions/close")) {
        closes.push({
          "If-Match": request.headers()["if-match"] ?? "",
          "Idempotency-Key": request.headers()["idempotency-key"] ?? "",
        });
        assignment = assignmentBody({
          lifecycle_state: "CLOSED",
          closed_at: "2026-09-02T10:00:00Z",
          aggregate_revision: 2,
        });
        etag = '"r2"';
        await route.fulfill({
          status: 200,
          headers: { ETag: etag, "Content-Type": "application/json" },
          body: JSON.stringify(assignment),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ title: "Not Found", status: 404 }),
      });
    });

    await page.goto("/teacher-os/teach");
    await connectDevSession(page);
    await expect(page.getByText("ACTIVE")).toBeVisible();
    await page.getByRole("link", { name: "Grade 5A" }).click();
    await expect(page.getByRole("button", { name: "Update due date" })).toBeVisible();
    await page.getByLabel(/Due date/i).fill("");
    await page.getByRole("button", { name: "Update due date" }).click();
    await expect(page.getByText(/Due date updated/i)).toBeVisible();
    expect(patches).toHaveLength(1);
    expect(patches[0]?.headers["If-Match"]).toBe('"r0"');
    expect(patches[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(assignment.lifecycle_state).toBe("ACTIVE");

    await page.getByRole("button", { name: "Close assignment" }).click();
    await page.getByRole("button", { name: "Confirm close" }).click();
    await expect(page.getByText(/Assignment closed/i)).toBeVisible();
    await expect(page.locator(".lifecycle-pill", { hasText: "CLOSED" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update due date" })).toHaveCount(0);
    expect(closes).toHaveLength(1);
  });

  test("E2E D — cancel branch", async ({ page }) => {
    let assignment = assignmentBody();
    let etag = '"r0"';

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();
      if (
        method === "GET" &&
        url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        await route.fulfill({
          status: 200,
          headers: { ETag: etag, "Content-Type": "application/json" },
          body: JSON.stringify(assignment),
        });
        return;
      }
      if (method === "POST" && url.endsWith("/actions/cancel")) {
        assignment = assignmentBody({
          lifecycle_state: "CANCELLED",
          cancelled_at: "2026-09-02T11:00:00Z",
          aggregate_revision: 1,
        });
        etag = '"r1"';
        await route.fulfill({
          status: 200,
          headers: { ETag: etag, "Content-Type": "application/json" },
          body: JSON.stringify(assignment),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ title: "Not Found", status: 404 }),
      });
    });

    await page.goto(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    await connectDevSession(page);
    await page.getByRole("button", { name: "Cancel assignment" }).click();
    await page.getByRole("button", { name: "Confirm cancel" }).click();
    await expect(page.getByText(/Assignment cancelled/i)).toBeVisible();
    await expect(
      page.locator(".lifecycle-pill", { hasText: "CANCELLED" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Close assignment" })).toHaveCount(0);
  });

  test("E2E E — 412 concurrency refresh", async ({ page }) => {
    let assignment = assignmentBody();
    let etag = '"r0"';
    let patches = 0;

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();
      if (
        method === "GET" &&
        url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        await route.fulfill({
          status: 200,
          headers: { ETag: etag, "Content-Type": "application/json" },
          body: JSON.stringify(assignment),
        });
        return;
      }
      if (method === "PATCH") {
        patches += 1;
        assignment = assignmentBody({
          due_at: "2026-09-09T12:00:00Z",
          aggregate_revision: 1,
        });
        etag = '"r1"';
        await route.fulfill({
          status: 412,
          contentType: "application/json",
          body: JSON.stringify({
            type: "about:blank",
            title: "Conflict",
            status: 412,
            code: "aggregate_revision_conflict",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ title: "Not Found", status: 404 }),
      });
    });

    await page.goto(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    await connectDevSession(page);
    await page.getByRole("button", { name: "Update due date" }).click();
    await expect(page.getByText(/Latest state was reloaded/i)).toBeVisible();
    expect(patches).toBe(1);
  });
});
