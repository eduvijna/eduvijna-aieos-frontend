import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  CONTENT_ID,
  mockJsonResponse,
  mockProblemResponse,
  renderApp,
  sampleWork,
  stubFetch,
  VERSION_ID,
  WORK_ID,
} from "@/test/test-utils";

const ASSESSMENT_ID = "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa";
const REMEDIATION_WORK_ID = "99999999-9999-7999-9999-999999999999";
const EXECUTION_ID = "eeeeeeee-eeee-7eee-eeee-eeeeeeeeeeee";

function sampleAssessment(overrides?: Record<string, unknown>) {
  return {
    assessment_id: ASSESSMENT_ID,
    teacher_principal_id: "bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb",
    class_ref: "class-5a",
    content_id: CONTENT_ID,
    content_version_id: VERSION_ID,
    class_result_level: "MIXED",
    class_result_note: "Class note must stay on Assessment only",
    lifecycle_state: "RECORDED",
    work_id: WORK_ID,
    execution_id: EXECUTION_ID,
    assignment_id: null,
    aggregate_revision: 2,
    recorded_at: "2026-09-03T11:00:00Z",
    voided_at: null,
    created_at: "2026-09-03T11:00:00Z",
    updated_at: "2026-09-03T11:00:00Z",
    ...overrides,
  };
}

function remediationWork(overrides?: Record<string, unknown>) {
  return {
    ...sampleWork,
    work_id: REMEDIATION_WORK_ID,
    intent_type: "remediate_class",
    goal_text: "Re-teach plant parts with guided practice",
    class_label: "Grade 5A",
    subject: "Science",
    topic: "Leaves",
    target_date: "2026-09-10",
    locale: "en-IN",
    aggregate_revision: 0,
    ...overrides,
  };
}

async function completeImproveFlow(
  user: ReturnType<typeof userEvent.setup>,
  options?: { goal?: string; subject?: string; topic?: string },
) {
  await screen.findByRole("heading", {
    name: /Review the source assessment/i,
  });
  expect(
    screen.getByText("Class note must stay on Assessment only"),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: /Continue to remediation goal/i }),
  );
  await user.type(
    screen.getByLabelText(/Remediation goal/i),
    options?.goal ?? "Re-teach plant parts with guided practice",
  );
  await user.click(screen.getByRole("button", { name: /Continue to context/i }));
  const date = screen.getByLabelText(/Target date/i);
  await user.clear(date);
  await user.type(date, "2026-09-10");
  if (options?.subject) {
    await user.type(screen.getByLabelText(/Subject/i), options.subject);
  }
  if (options?.topic) {
    await user.type(screen.getByLabelText(/Topic/i), options.topic);
  }
  await user.click(
    screen.getByRole("button", { name: /Continue to confirm/i }),
  );
  expect(
    screen.getByText(
      /Creating this starts a remediation preparation\. Nothing is generated, published or assigned yet/i,
    ),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: /Create remediation preparation/i }),
  );
}

describe("TOS-DEV09-I03 Improve page", () => {
  it("does not render PlaceholderPage at /teacher-os/improve", async () => {
    stubFetch((call) => {
      if (call.url.includes("/api/v1/assessment/classroom-assessments")) {
        return mockJsonResponse({ items: [] });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp("/teacher-os/improve");
    expect(
      await screen.findByRole("heading", { name: "Improve" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Not implemented yet/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Assessed does not mean improvement is required/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/learner/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/student/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI recommend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mastery/i)).not.toBeInTheDocument();
  });

  it("lists eligible RECORDED assessments including all class result levels", async () => {
    stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.includes("lifecycle_state=RECORDED")
      ) {
        return mockJsonResponse({
          items: [
            sampleAssessment({
              assessment_id: "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaa1",
              class_result_level: "DEMONSTRATED",
              class_result_note: null,
            }),
            sampleAssessment({
              assessment_id: "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaa2",
              class_result_level: "MIXED",
            }),
            sampleAssessment({
              assessment_id: "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaa3",
              class_result_level: "NOT_YET_DEMONSTRATED",
              class_result_note: null,
            }),
          ],
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp("/teacher-os/improve");
    expect(
      await screen.findAllByRole("link", { name: /Improve this class/i }),
    ).toHaveLength(3);
    const cardList = document.querySelector(".improve-card-list");
    expect(cardList?.textContent).toMatch(/Demonstrated/);
    expect(cardList?.textContent).toMatch(/Mixed/);
    expect(cardList?.textContent).toMatch(/Not yet demonstrated/);
    expect(screen.queryByText(/failing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/weak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/behind/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/needs remediation/i)).not.toBeInTheDocument();
  });


  it("query-param Assessment selection loads detail when RECORDED", async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(sampleAssessment(), { etag: '"r2"' });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp(`/teacher-os/improve?assessment_id=${ASSESSMENT_ID}`);
    expect(
      await screen.findByRole("heading", {
        name: /Review the source assessment/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("class-5a")).toBeInTheDocument();
    expect(
      screen.getByText("Class note must stay on Assessment only"),
    ).toBeInTheDocument();
  });

  it("VOIDED Assessment cannot create remediation", async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(
          sampleAssessment({
            lifecycle_state: "VOIDED",
            voided_at: "2026-09-04T12:00:00Z",
          }),
          { etag: '"r3"' },
        );
      }
      if (call.url.includes("lifecycle_state=RECORDED")) {
        return mockJsonResponse({ items: [] });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp(`/teacher-os/improve?assessment_id=${ASSESSMENT_ID}`);
    expect(
      await screen.findByRole("heading", { name: /Assessment not eligible/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Create remediation preparation/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Continue to remediation goal/i }),
    ).not.toBeInTheDocument();
  });

  it("posts exact remediation body without note/class_ref/source IDs and navigates to Work", async () => {
    const user = userEvent.setup();
    const calls = stubFetch((call) => {
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(sampleAssessment(), { etag: '"r2"' });
      }
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/works/from-classroom-assessment")
      ) {
        return mockJsonResponse(remediationWork(), { status: 201 });
      }
      if (call.url.endsWith(`/api/v1/teaching/works/${REMEDIATION_WORK_ID}`)) {
        return mockJsonResponse(remediationWork(), { etag: '"r0"' });
      }
      if (
        call.url.endsWith(
          `/api/v1/teaching/works/${REMEDIATION_WORK_ID}/artifacts`,
        )
      ) {
        return mockJsonResponse({
          work_id: REMEDIATION_WORK_ID,
          items: [],
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/improve?assessment_id=${ASSESSMENT_ID}`);
    await completeImproveFlow(user, {
      subject: "Science",
      topic: "Leaves",
    });

    await waitFor(() => {
      const create = calls.find(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith(
            "/api/v1/teaching/works/from-classroom-assessment",
          ),
      );
      expect(create).toBeTruthy();
      expect(create?.headers.get("Idempotency-Key")).toBeTruthy();
      const body = create?.body as Record<string, unknown>;
      expect(body).toEqual({
        assessment_id: ASSESSMENT_ID,
        expected_assessment_aggregate_revision: 2,
        goal_text: "Re-teach plant parts with guided practice",
        target_date: "2026-09-10",
        locale: "en-IN",
        subject: "Science",
        topic: "Leaves",
      });
      expect(body.class_ref).toBeUndefined();
      expect(body.class_label).toBeUndefined();
      expect(body.class_result_note).toBeUndefined();
      expect(body.class_result_level).toBeUndefined();
      expect(body.intent_type).toBeUndefined();
      expect(body.content_id).toBeUndefined();
      expect(body.content_version_id).toBeUndefined();
      expect(body.source_work_id).toBeUndefined();
      expect(body.source_execution_id).toBeUndefined();
      expect(body.work_id).toBeUndefined();
      expect(body.execution_id).toBeUndefined();
      expect(body.tenant_id).toBeUndefined();
      expect(body.teacher_principal_id).toBeUndefined();
      expect(body.learner_id).toBeUndefined();
    });

    expect(
      await screen.findByRole("heading", {
        name: /Re-teach plant parts with guided practice/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Remediate class")).toBeInTheDocument();
    expect(
      calls.some((call) => call.url.includes("/actions/generate")),
    ).toBe(false);
    expect(
      calls.some((call) => call.url.includes("/actions/prepare")),
    ).toBe(false);
    expect(calls.some((call) => call.url.includes("/publish"))).toBe(false);
    expect(
      calls.some((call) => call.url.includes("/teaching/assignments")),
    ).toBe(false);
    expect(calls.some((call) => call.url.includes("/improvements"))).toBe(
      false,
    );
  });

  it("requires teacher-confirmed goal", async () => {
    const user = userEvent.setup();
    stubFetch((call) => {
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(sampleAssessment(), { etag: '"r2"' });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp(`/teacher-os/improve?assessment_id=${ASSESSMENT_ID}`);
    await screen.findByRole("heading", {
      name: /Review the source assessment/i,
    });
    await user.click(
      screen.getByRole("button", { name: /Continue to remediation goal/i }),
    );
    await user.click(screen.getByRole("button", { name: /Continue to context/i }));
    expect(
      await screen.findByText(/Write the remediation goal/i),
    ).toBeInTheDocument();
  });

  it("reuses Idempotency-Key for unchanged retry and mints on fingerprint change", async () => {
    const user = userEvent.setup();
    let failOnce = true;
    const calls = stubFetch((call) => {
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(sampleAssessment(), { etag: '"r2"' });
      }
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/works/from-classroom-assessment")
      ) {
        if (failOnce) {
          failOnce = false;
          return mockProblemResponse(503, "service_unavailable");
        }
        return mockJsonResponse(remediationWork(), { status: 201 });
      }
      if (call.url.endsWith(`/api/v1/teaching/works/${REMEDIATION_WORK_ID}`)) {
        return mockJsonResponse(remediationWork(), { etag: '"r0"' });
      }
      if (
        call.url.endsWith(
          `/api/v1/teaching/works/${REMEDIATION_WORK_ID}/artifacts`,
        )
      ) {
        return mockJsonResponse({
          work_id: REMEDIATION_WORK_ID,
          items: [],
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/improve?assessment_id=${ASSESSMENT_ID}`);
    await completeImproveFlow(user);
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: /Create remediation preparation/i }),
    );
    await waitFor(() => {
      const posts = calls.filter(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith(
            "/api/v1/teaching/works/from-classroom-assessment",
          ),
      );
      expect(posts.length).toBeGreaterThanOrEqual(2);
      expect(posts[0]?.headers.get("Idempotency-Key")).toBe(
        posts[1]?.headers.get("Idempotency-Key"),
      );
    });
  });

  it("stale Assessment revision requires re-review with no auto-resubmit", async () => {
    const user = userEvent.setup();
    let revision = 2;
    const calls = stubFetch((call) => {
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(
          sampleAssessment({ aggregate_revision: revision }),
          { etag: `"r${revision}"` },
        );
      }
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/works/from-classroom-assessment")
      ) {
        return mockProblemResponse(412, "assessment_revision_mismatch");
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/improve?assessment_id=${ASSESSMENT_ID}`);
    await screen.findByRole("heading", {
      name: /Review the source assessment/i,
    });
    await user.click(
      screen.getByRole("button", { name: /Continue to remediation goal/i }),
    );
    await user.type(
      screen.getByLabelText(/Remediation goal/i),
      "Re-teach plant parts with guided practice",
    );
    await user.click(screen.getByRole("button", { name: /Continue to context/i }));
    const date = screen.getByLabelText(/Target date/i);
    await user.clear(date);
    await user.type(date, "2026-09-10");
    await user.click(
      screen.getByRole("button", { name: /Continue to confirm/i }),
    );

    revision = 3;
    await user.click(
      screen.getByRole("button", { name: /Create remediation preparation/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/changed since you reviewed it/i),
      ).toBeInTheDocument();
    });
    const posts = calls.filter(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/works/from-classroom-assessment"),
    );
    expect(posts).toHaveLength(0);
    expect(
      screen.queryByRole("heading", {
        name: /Re-teach plant parts with guided practice/i,
      }),
    ).not.toBeInTheDocument();
  });
});

describe("TOS-DEV09-I03 Assess → Improve handoff", () => {
  it("RECORDED assessment exposes Improve this class and VOIDED does not", async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(sampleAssessment(), { etag: '"r2"' });
      }
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments")
      ) {
        return mockJsonResponse({ items: [sampleAssessment()] });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp(`/teacher-os/assess?assessment_id=${ASSESSMENT_ID}`);
    const link = await screen.findByRole("link", {
      name: /Improve this class/i,
    });
    expect(link).toHaveAttribute(
      "href",
      `/teacher-os/improve?assessment_id=${ASSESSMENT_ID}`,
    );
  });

  it("VOIDED assessment does not expose Improve create action", async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(
          sampleAssessment({
            lifecycle_state: "VOIDED",
            voided_at: "2026-09-04T12:00:00Z",
          }),
          { etag: '"r3"' },
        );
      }
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments")
      ) {
        return mockJsonResponse({
          items: [
            sampleAssessment({
              lifecycle_state: "VOIDED",
              voided_at: "2026-09-04T12:00:00Z",
            }),
          ],
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp(`/teacher-os/assess?assessment_id=${ASSESSMENT_ID}`);
    await screen.findByText(/VOIDED is terminal/i);
    expect(
      screen.queryByRole("link", { name: /Improve this class/i }),
    ).not.toBeInTheDocument();
  });
});

describe("TOS-DEV09-I03 remediate_class Work UX", () => {
  it("renders remediate_class Work safely in existing Work UI", async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/api/v1/teaching/works/${REMEDIATION_WORK_ID}`)) {
        return mockJsonResponse(remediationWork(), { etag: '"r0"' });
      }
      if (
        call.url.endsWith(
          `/api/v1/teaching/works/${REMEDIATION_WORK_ID}/artifacts`,
        )
      ) {
        return mockJsonResponse({
          work_id: REMEDIATION_WORK_ID,
          items: [],
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp(`/teacher-os/work/${REMEDIATION_WORK_ID}`);
    expect(
      await screen.findByRole("heading", {
        name: /Re-teach plant parts with guided practice/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Remediate class")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Saved remediation preparation/i }),
    ).toBeInTheDocument();
    const page = screen.getByRole("heading", {
      name: /Re-teach plant parts with guided practice/i,
    }).closest("article");
    expect(page).toBeTruthy();
    expect(within(page!).queryByText(/learner/i)).not.toBeInTheDocument();
  });
});
