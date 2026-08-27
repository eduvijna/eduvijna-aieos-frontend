import { test, expect } from "@playwright/test";

const CONTENT_ID = "11111111-1111-1111-1111-111111111111";
const VERSION_ID = "22222222-2222-2222-2222-222222222222";

const queueItem = {
  content_id: CONTENT_ID,
  version_id: VERSION_ID,
  version_number: 1,
  content_type: "lesson.plan",
  title: "E2E Photosynthesis",
  description: "E2E draft",
  locale: "en-IN",
  artifact_status: "In Review",
  origin: "teacher",
  aggregate_revision: 2,
  submitted_at: "2026-08-20T10:00:00Z",
  version_created_at: "2026-08-20T09:00:00Z",
  published_version_id: null,
};

const detail = {
  ...queueItem,
  schema_id: "lesson.plan",
  schema_version: 1,
  payload: { objective: "E2E payload", note: "safe" },
  payload_sha256: "deadbeef",
};

async function connectDevSession(page: import("@playwright/test").Page) {
  await page.goto("/teacher-os/today");
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

function calendarDate(offsetDays: number): string {
  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offsetDays,
  );
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function mockReviewApis(
  page: import("@playwright/test").Page,
  options?: { approveOk?: boolean },
) {
  // Today is Mission-first: the Review hero is what routes into the queue.
  await page.route("**/api/v1/teacher-os/today/mission**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mission_date: calendarDate(0),
        review: { pending_count: 1 },
        preparation: { active_work_count: 0, continue_work: null },
        hero_action: { kind: "review", work_id: null },
      }),
    });
  });
  await page.route("**/api/v1/teacher-os/review-queue?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [queueItem], next_cursor: null }),
    });
  });
  await page.route("**/api/v1/teacher-os/review-queue", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [queueItem], next_cursor: null }),
    });
  });
  await page.route(
    `**/api/v1/teacher-os/review-queue/${CONTENT_ID}/versions/${VERSION_ID}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { ETag: '"r2"' },
        body: JSON.stringify(detail),
      });
    },
  );
  await page.route(
    `**/api/v1/contents/${CONTENT_ID}/versions/${VERSION_ID}/actions/approve`,
    async (route) => {
      const headers = route.request().headers();
      expect(headers["if-match"]).toBe('"r2"');
      expect(headers["idempotency-key"]).toBeTruthy();
      await route.fulfill({
        status: options?.approveOk === false ? 412 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          options?.approveOk === false
            ? { title: "Precondition Failed", status: 412 }
            : {
                review_decision_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                content_id: CONTENT_ID,
                version_id: VERSION_ID,
                decision: "APPROVED",
                reason_code: null,
                comment: null,
                decided_at: "2026-08-20T12:00:00Z",
                stewardship_state: "APPROVED",
                aggregate_revision: 3,
              },
        ),
      });
    },
  );
  await page.route(
    `**/api/v1/contents/${CONTENT_ID}/versions/${VERSION_ID}/actions/request-changes`,
    async (route) => {
      const post = route.request().postDataJSON() as { comment?: string };
      expect(post.comment).toBeTruthy();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          review_decision_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          content_id: CONTENT_ID,
          version_id: VERSION_ID,
          decision: "CHANGES_REQUESTED",
          reason_code: null,
          comment: post.comment,
          decided_at: "2026-08-20T12:00:00Z",
          stewardship_state: "CHANGES_REQUESTED",
          aggregate_revision: 3,
        }),
      });
    },
  );
}

test.describe("Teacher OS review smoke", () => {
  test("Today → Review Queue → open artifact → approve", async ({ page }) => {
    await mockReviewApis(page);
    await connectDevSession(page);

    await expect(
      page.getByRole("heading", { name: /Today's Mission/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /1 item waiting for review/i }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Open review queue/i }).click();

    await expect(
      page.getByRole("heading", { name: "Review Queue" }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Open artifact/i }).click();

    await expect(page.getByText("E2E payload")).toBeVisible();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(
      page.getByRole("heading", { name: "Review Queue" }),
    ).toBeVisible();
  });

  test("request-changes path", async ({ page }) => {
    await mockReviewApis(page);
    await connectDevSession(page);
    await page.getByRole("link", { name: /Open review queue/i }).click();
    await page.getByRole("link", { name: /Open artifact/i }).click();
    await expect(
      page.getByRole("heading", { name: "E2E Photosynthesis" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Request changes" }).click();
    await page
      .getByLabel(/Comment \(required\)/i)
      .fill("Please strengthen the assessment rubric.");
    await page.getByRole("button", { name: /Submit request changes/i }).click();
    await expect(
      page.getByRole("heading", { name: "Review Queue" }),
    ).toBeVisible();
  });
});
