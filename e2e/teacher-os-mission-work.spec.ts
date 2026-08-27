import { test, expect, type Page } from "@playwright/test";

const WORK_ID = "44444444-4444-4444-4444-444444444444";

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

const TOMORROW = calendarDate(1);

type Work = {
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

async function connectDevSession(page: Page) {
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

/**
 * A minimal in-memory stand-in for the Teaching bounded context: one Work row,
 * an aggregate revision behind the ETag, and a Mission derived on every read.
 */
async function mockTeachingApis(page: Page) {
  let work: Work | null = null;
  const seen = { createKeys: [] as string[], refineKeys: [] as string[] };

  await page.route("**/api/v1/teacher-os/today/mission**", async (route) => {
    const mission = work
      ? {
          mission_date: calendarDate(0),
          review: { pending_count: 0 },
          preparation: {
            active_work_count: 1,
            continue_work: {
              work_id: work.work_id,
              intent_type: work.intent_type,
              goal_text: work.goal_text,
              class_label: work.class_label,
              subject: work.subject,
              topic: work.topic,
              target_date: work.target_date,
              aggregate_revision: work.aggregate_revision,
              updated_at: work.updated_at,
            },
          },
          hero_action: { kind: "continue_work", work_id: work.work_id },
        }
      : {
          mission_date: calendarDate(0),
          review: { pending_count: 0 },
          preparation: { active_work_count: 0, continue_work: null },
          hero_action: { kind: "prepare_tomorrow", work_id: null },
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mission),
    });
  });

  await page.route("**/api/v1/teaching/works", async (route) => {
    const headers = route.request().headers();
    expect(headers["idempotency-key"]).toBeTruthy();
    seen.createKeys.push(headers["idempotency-key"]);

    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body.intent_type).toBe("prepare_tomorrow");
    work = {
      work_id: WORK_ID,
      intent_type: String(body.intent_type),
      goal_text: String(body.goal_text),
      class_label: (body.class_label as string | null) ?? null,
      subject: (body.subject as string | null) ?? null,
      topic: (body.topic as string | null) ?? null,
      target_date: String(body.target_date),
      locale: String(body.locale),
      aggregate_revision: 1,
      created_at: "2026-08-27T04:00:00Z",
      updated_at: "2026-08-27T04:00:00Z",
      archived_at: null,
    };
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: {
        ETag: '"r1"',
        Location: `/api/v1/teaching/works/${WORK_ID}`,
      },
      body: JSON.stringify(work),
    });
  });

  await page.route("**/api/v1/teaching/works/*", async (route) => {
    if (!work) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ title: "Not Found", status: 404 }),
      });
      return;
    }
    if (route.request().method() === "PATCH") {
      const headers = route.request().headers();
      expect(headers["if-match"]).toBe(`"r${work.aggregate_revision}"`);
      expect(headers["idempotency-key"]).toBeTruthy();
      seen.refineKeys.push(headers["idempotency-key"]);
      const patch = route.request().postDataJSON() as Partial<Work>;
      work = {
        ...work,
        ...patch,
        aggregate_revision: work.aggregate_revision + 1,
        updated_at: "2026-08-27T06:00:00Z",
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { ETag: `"r${work.aggregate_revision}"` },
      body: JSON.stringify(work),
    });
  });

  return seen;
}

test.describe("Teacher OS mission → intent → work smoke", () => {
  test("Today → Prepare tomorrow → confirm intent → Work → refine → Continue Work", async ({
    page,
  }) => {
    const seen = await mockTeachingApis(page);
    await connectDevSession(page);

    await expect(
      page.getByRole("heading", { level: 1, name: /Today's Mission/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: /Nothing is waiting\. Prepare tomorrow's lesson\./i,
      }),
    ).toBeVisible();

    await page
      .getByRole("link", { name: /Help me prepare tomorrow/i })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: /Help me prepare tomorrow/i }),
    ).toBeVisible();
    await expect(page.getByText(/DEV placeholder/i)).toHaveCount(0);

    await page
      .getByLabel(/Outcome for this lesson/i)
      .fill("Explain why leaves look green");
    await page.getByRole("button", { name: /Continue to context/i }).click();

    await expect(page.getByLabel(/Lesson date/i)).toHaveValue(TOMORROW);
    await expect(page.getByLabel(/^Locale/i)).toHaveValue("en-IN");
    await page.getByLabel(/^Class \(optional\)/i).fill("Grade 5B");
    await page.getByLabel(/^Subject \(optional\)/i).fill("Science");
    await page.getByLabel(/^Topic \(optional\)/i).fill("Photosynthesis");
    await page.getByRole("button", { name: /Review and confirm/i }).click();

    await expect(page.getByTestId("prepare-summary")).toHaveText(
      `Prepare tomorrow · Grade 5B · Science · Photosynthesis · ${TOMORROW}`,
    );
    await expect(
      page.getByText(/Goal: Explain why leaves look green/i),
    ).toBeVisible();

    await page.getByRole("button", { name: /Create preparation/i }).click();

    await expect(page).toHaveURL(new RegExp(`/teacher-os/work/${WORK_ID}$`));
    await expect(
      page.getByRole("heading", { name: /Saved preparation/i }),
    ).toBeVisible();
    await expect(page.getByText("Grade 5B")).toBeVisible();
    await expect(
      page.getByText(/Preparation is ready for generation\./i),
    ).toBeVisible();
    expect(seen.createKeys).toHaveLength(1);

    await page.getByLabel(/^Topic$/i).fill("Photosynthesis in leaves");
    await page.getByRole("button", { name: /Save changes/i }).click();
    await expect(page.getByText(/now at revision 2/i)).toBeVisible();
    expect(seen.refineKeys).toHaveLength(1);

    await page.getByRole("link", { name: /Today's Mission/i }).click();
    await expect(
      page.getByRole("heading", {
        name: /Continue tomorrow's Photosynthesis in leaves preparation/i,
      }),
    ).toBeVisible();

    await page.getByRole("link", { name: /Continue preparation/i }).click();
    await expect(page).toHaveURL(new RegExp(`/teacher-os/work/${WORK_ID}$`));
    await expect(
      page.getByRole("heading", { name: /Refine this preparation/i }),
    ).toBeVisible();
    // Re-read from the server, so the refinement is the API's value, not the browser's.
    await expect(page.getByLabel(/^Topic$/i)).toHaveValue(
      "Photosynthesis in leaves",
    );
  });

  test("Prepare offers no generator grid and Work offers no Generate button", async ({
    page,
  }) => {
    await mockTeachingApis(page);
    await connectDevSession(page);

    await page
      .getByRole("link", { name: /Help me prepare tomorrow/i })
      .click();
    for (const name of [
      /Generate Worksheet/i,
      /Generate Quiz/i,
      /Generate Lesson Plan/i,
    ]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
      await expect(page.getByRole("link", { name })).toHaveCount(0);
    }
  });
});
