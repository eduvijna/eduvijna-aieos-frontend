import { test, expect, type Page } from "@playwright/test";

const ASSESSMENT_ID = "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa";
const WORK_ID = "99999999-9999-7999-9999-999999999999";
const CONTENT_ID = "11111111-1111-1111-1111-111111111111";
const VERSION_ID = "22222222-2222-2222-2222-222222222222";

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

function assessmentBody(overrides: Record<string, unknown> = {}) {
  return {
    assessment_id: ASSESSMENT_ID,
    teacher_principal_id: "bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb",
    class_ref: "class-5a",
    content_id: CONTENT_ID,
    content_version_id: VERSION_ID,
    class_result_level: "MIXED",
    class_result_note: "Display only — never posted",
    lifecycle_state: "RECORDED",
    work_id: "33333333-3333-3333-3333-333333333333",
    execution_id: "eeeeeeee-eeee-7eee-eeee-eeeeeeeeeeee",
    assignment_id: null,
    aggregate_revision: 1,
    recorded_at: "2026-09-03T11:00:00Z",
    voided_at: null,
    created_at: "2026-09-03T11:00:00Z",
    updated_at: "2026-09-03T11:00:00Z",
    ...overrides,
  };
}

function remediationWork() {
  return {
    work_id: WORK_ID,
    intent_type: "remediate_class",
    goal_text: "Rebuild confidence with plant-part practice",
    class_label: "Grade 5A",
    subject: "Science",
    topic: "Leaves",
    target_date: "2026-09-12",
    locale: "en-IN",
    aggregate_revision: 0,
    created_at: "2026-09-05T08:00:00Z",
    updated_at: "2026-09-05T08:00:00Z",
    archived_at: null,
  };
}

test.describe("TOS-DEV09-I03 Improve UX", () => {
  test("RECORDED list → goal confirm → remediation POST → Work detail", async ({
    page,
  }) => {
    const creates: Array<Record<string, unknown>> = [];

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (
        method === "GET" &&
        url.includes("/assessment/classroom-assessments") &&
        !url.includes(ASSESSMENT_ID)
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [assessmentBody()], has_more: false }),
        });
        return;
      }
      if (
        method === "GET" &&
        url.includes(`/assessment/classroom-assessments/${ASSESSMENT_ID}`)
      ) {
        await route.fulfill({
          status: 200,
          headers: { ETag: '"r1"', "Content-Type": "application/json" },
          body: JSON.stringify(assessmentBody()),
        });
        return;
      }
      if (
        method === "POST" &&
        url.includes("/teaching/works/from-classroom-assessment")
      ) {
        creates.push(request.postDataJSON() as Record<string, unknown>);
        expect(request.headers()["idempotency-key"]).toBeTruthy();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(remediationWork()),
        });
        return;
      }
      if (method === "GET" && url.includes(`/teaching/works/${WORK_ID}/artifacts`)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ work_id: WORK_ID, items: [] }),
        });
        return;
      }
      if (method === "GET" && url.includes(`/teaching/works/${WORK_ID}`)) {
        await route.fulfill({
          status: 200,
          headers: { ETag: '"r0"', "Content-Type": "application/json" },
          body: JSON.stringify(remediationWork()),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "Not Found", status: 404 }),
      });
    });

    await page.goto("/teacher-os/improve");
    await connectDevSession(page);
    await expect(page.getByRole("heading", { name: "Improve" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Improve this class/i }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: /Improve this class/i }).click();
    await expect(
      page.getByRole("heading", { name: /Review the source assessment/i }),
    ).toBeVisible();
    await expect(page.getByText("Display only — never posted")).toBeVisible();
    await page
      .getByRole("button", { name: /Continue to remediation goal/i })
      .click();
    await page
      .getByLabel(/Remediation goal/i)
      .fill("Rebuild confidence with plant-part practice");
    await page.getByRole("button", { name: /Continue to context/i }).click();
    await page.getByLabel(/Target date/i).fill("2026-09-12");
    await page.getByLabel(/^Subject/i).fill("Science");
    await page.getByRole("button", { name: /Continue to confirm/i }).click();
    await expect(
      page.getByText(
        /Creating this starts a remediation preparation\. Nothing is generated, published or assigned yet/i,
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Create remediation preparation/i })
      .click();

    await expect(page).toHaveURL(new RegExp(`/teacher-os/work/${WORK_ID}`));
    await expect(
      page.getByRole("heading", {
        name: /Rebuild confidence with plant-part practice/i,
      }),
    ).toBeVisible();
    await expect(page.getByText("Remediate class")).toBeVisible();

    expect(creates).toHaveLength(1);
    expect(creates[0]).toEqual({
      assessment_id: ASSESSMENT_ID,
      expected_assessment_aggregate_revision: 1,
      goal_text: "Rebuild confidence with plant-part practice",
      target_date: "2026-09-12",
      locale: "en-IN",
      subject: "Science",
      topic: null,
    });
    expect(creates[0]?.class_ref).toBeUndefined();
    expect(creates[0]?.class_result_note).toBeUndefined();
  });

  test("stale Assessment → no automatic remediation create", async ({ page }) => {
    let revision = 1;
    const posts: string[] = [];

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (
        method === "GET" &&
        url.includes(`/assessment/classroom-assessments/${ASSESSMENT_ID}`)
      ) {
        await route.fulfill({
          status: 200,
          headers: {
            ETag: `"r${revision}"`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            assessmentBody({ aggregate_revision: revision }),
          ),
        });
        return;
      }
      if (
        method === "POST" &&
        url.includes("/teaching/works/from-classroom-assessment")
      ) {
        posts.push(url);
        await route.fulfill({
          status: 412,
          contentType: "application/problem+json",
          body: JSON.stringify({
            title: "Precondition Failed",
            status: 412,
            code: "assessment_revision_mismatch",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "Not Found", status: 404 }),
      });
    });

    await page.goto(`/teacher-os/improve?assessment_id=${ASSESSMENT_ID}`);
    await connectDevSession(page);
    await expect(
      page.getByRole("heading", { name: /Review the source assessment/i }),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("button", { name: /Continue to remediation goal/i })
      .click();
    await page.getByLabel(/Remediation goal/i).fill("Fresh deliberate goal");
    await page.getByRole("button", { name: /Continue to context/i }).click();
    await page.getByLabel(/Target date/i).fill("2026-09-12");
    await page.getByRole("button", { name: /Continue to confirm/i }).click();

    revision = 4;
    await page
      .getByRole("button", { name: /Create remediation preparation/i })
      .click();

    await expect(page.getByText(/changed since you reviewed it/i)).toBeVisible();
    expect(posts.length).toBe(0);
    await expect(page).not.toHaveURL(/\/teacher-os\/work\//);
  });
});
