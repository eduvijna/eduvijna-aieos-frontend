import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  CONTENT_ID,
  mockJsonResponse,
  mockProblemResponse,
  renderApp,
  stubFetch,
  VERSION_ID,
  WORK_ID,
} from "@/test/test-utils";
import {
  CLASS_RESULT_NOTE_MAX,
  CLASS_RESULT_NOTE_PRIVACY_REMINDER,
} from "./assessmentPresentation";

const EXECUTION_ID = "eeeeeeee-eeee-7eee-eeee-eeeeeeeeeeee";
const ASSESSMENT_ID = "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa";
const OTHER_VERSION_ID = "cccccccc-cccc-7ccc-cccc-cccccccccccc";

function sampleExecution(overrides?: Record<string, unknown>) {
  return {
    execution_id: EXECUTION_ID,
    teacher_principal_id: "bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb",
    work_id: WORK_ID,
    class_ref: "class-5a",
    lifecycle_state: "COMPLETED",
    started_at: "2026-09-03T10:00:00Z",
    completed_at: "2026-09-03T10:45:00Z",
    cancelled_at: null,
    bindings: [
      {
        content_id: CONTENT_ID,
        content_version_id: VERSION_ID,
        artifact_kind: "worksheet",
      },
      {
        content_id: "dddddddd-dddd-7ddd-dddd-dddddddddddd",
        content_version_id: OTHER_VERSION_ID,
        artifact_kind: "lesson_plan",
      },
      {
        content_id: "eeeeeeee-eeee-7eee-eeee-eeeeeeeeee01",
        content_version_id: "ffffffff-ffff-7fff-ffff-ffffffffff01",
        artifact_kind: "answer_key",
      },
    ],
    observations: [],
    aggregate_revision: 1,
    created_at: "2026-09-03T10:00:00Z",
    updated_at: "2026-09-03T10:45:00Z",
    ...overrides,
  };
}

function sampleAssessment(overrides?: Record<string, unknown>) {
  return {
    assessment_id: ASSESSMENT_ID,
    teacher_principal_id: "bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb",
    class_ref: "class-5a",
    content_id: CONTENT_ID,
    content_version_id: VERSION_ID,
    class_result_level: "DEMONSTRATED",
    class_result_note: null,
    lifecycle_state: "RECORDED",
    work_id: WORK_ID,
    execution_id: EXECUTION_ID,
    assignment_id: null,
    aggregate_revision: 0,
    recorded_at: "2026-09-03T11:00:00Z",
    voided_at: null,
    created_at: "2026-09-03T11:00:00Z",
    updated_at: "2026-09-03T11:00:00Z",
    ...overrides,
  };
}

describe("TOS-DEV08-I03 Assess page", () => {
  it("does not render PlaceholderPage at /teacher-os/assess", async () => {
    stubFetch((call) => {
      if (call.url.includes("/api/v1/assessment/classroom-assessments")) {
        return mockJsonResponse({ items: [] });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp("/teacher-os/assess");
    expect(await screen.findByRole("heading", { name: "Assess" })).toBeInTheDocument();
    expect(screen.queryByText(/Not implemented yet/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/learner/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/student/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Improve recommendation/i)).not.toBeInTheDocument();
  });

  it("loads completed execution context and offers only eligible artifact kinds", async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)) {
        return mockJsonResponse(sampleExecution());
      }
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments")
      ) {
        return mockJsonResponse({ items: [] });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/assess?execution_id=${EXECUTION_ID}`);
    expect(await screen.findByText("worksheet")).toBeInTheDocument();
    expect(screen.getByText(VERSION_ID)).toBeInTheDocument();
    expect(screen.queryByText("lesson_plan")).not.toBeInTheDocument();
    expect(screen.queryByText("answer_key")).not.toBeInTheDocument();
    expect(screen.getByText(CLASS_RESULT_NOTE_PRIVACY_REMINDER)).toBeInTheDocument();
    expect(screen.getByLabelText("Class result note")).toHaveAttribute(
      "maxLength",
      String(CLASS_RESULT_NOTE_MAX),
    );
  });

  it("records with Idempotency-Key and without tenant/teacher identity in body", async () => {
    const user = userEvent.setup();
    const calls = stubFetch((call) => {
      if (call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)) {
        return mockJsonResponse(sampleExecution());
      }
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments") &&
        !call.url.includes(ASSESSMENT_ID)
      ) {
        return mockJsonResponse({ items: [] });
      }
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/assessment/classroom-assessments")
      ) {
        return mockJsonResponse(sampleAssessment(), {
          status: 201,
          etag: '"r0"',
        });
      }
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(sampleAssessment(), { etag: '"r0"' });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/assess?execution_id=${EXECUTION_ID}`);
    await screen.findByRole("button", { name: /Record class assessment/i });
    await user.click(
      screen.getByRole("radio", { name: /Not yet demonstrated/i }),
    );
    await user.type(
      screen.getByLabelText("Class result note"),
      "Class struggled with photosynthesis overall",
    );
    await user.click(
      screen.getByRole("button", { name: /Record class assessment/i }),
    );

    await waitFor(() => {
      const record = calls.find(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith("/api/v1/assessment/classroom-assessments"),
      );
      expect(record).toBeTruthy();
      expect(record?.headers.get("Idempotency-Key")).toBeTruthy();
      const body = record?.body as Record<string, unknown>;
      expect(body).toMatchObject({
        class_ref: "class-5a",
        content_id: CONTENT_ID,
        content_version_id: VERSION_ID,
        class_result_level: "NOT_YET_DEMONSTRATED",
        class_result_note: "Class struggled with photosynthesis overall",
        execution_id: EXECUTION_ID,
        work_id: WORK_ID,
      });
      expect(body.tenant_id).toBeUndefined();
      expect(body.teacher_principal_id).toBeUndefined();
      expect(body.learner_id).toBeUndefined();
      expect(body.student_id).toBeUndefined();
    });
    expect(
      await screen.findByText(/Classroom assessment recorded/i),
    ).toBeInTheDocument();
  });

  it("reuses Idempotency-Key for same RECORD material", async () => {
    const user = userEvent.setup();
    let failOnce = true;
    const calls = stubFetch((call) => {
      if (call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)) {
        return mockJsonResponse(sampleExecution());
      }
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments")
      ) {
        return mockJsonResponse({ items: [] });
      }
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/assessment/classroom-assessments")
      ) {
        if (failOnce) {
          failOnce = false;
          return mockProblemResponse(503, "authorization_unavailable");
        }
        return mockJsonResponse(sampleAssessment(), {
          status: 201,
          etag: '"r0"',
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/assess?execution_id=${EXECUTION_ID}`);
    await screen.findByRole("button", { name: /Record class assessment/i });
    await user.click(
      screen.getByRole("button", { name: /Record class assessment/i }),
    );
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Record class assessment/i }),
    );
    await waitFor(() => {
      const posts = calls.filter(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith("/api/v1/assessment/classroom-assessments"),
      );
      expect(posts).toHaveLength(2);
      expect(posts[0]?.headers.get("Idempotency-Key")).toBe(
        posts[1]?.headers.get("Idempotency-Key"),
      );
    });
  });

  it("shows durable LIST history and GET detail", async () => {
    stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments") &&
        !call.url.includes(ASSESSMENT_ID)
      ) {
        return mockJsonResponse({ items: [sampleAssessment()] });
      }
      if (call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)) {
        return mockJsonResponse(sampleAssessment(), { etag: '"r0"' });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/assess?assessment_id=${ASSESSMENT_ID}`);
    expect(
      await screen.findByRole("heading", { name: "Classroom assessment" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/DEMONSTRATED/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("class-5a").length).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('[data-state="RECORDED"]').length,
    ).toBeGreaterThan(0);
  });

  it("CORRECT sends If-Match and Idempotency-Key", async () => {
    const user = userEvent.setup();
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments") &&
        !call.url.includes("/actions/")
      ) {
        if (call.url.endsWith(`/${ASSESSMENT_ID}`)) {
          return mockJsonResponse(sampleAssessment(), { etag: '"r0"' });
        }
        return mockJsonResponse({ items: [sampleAssessment()] });
      }
      if (call.url.includes(`/actions/correct`)) {
        return mockJsonResponse(
          sampleAssessment({
            class_result_level: "MIXED",
            aggregate_revision: 1,
          }),
          { etag: '"r1"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/assess?assessment_id=${ASSESSMENT_ID}`);
    await screen.findByRole("button", { name: /Correct assessment/i });
    await user.click(screen.getByRole("radio", { name: /^Mixed/i }));
    await user.click(screen.getByRole("button", { name: /Correct assessment/i }));

    await waitFor(() => {
      const correct = calls.find((call) => call.url.includes("/actions/correct"));
      expect(correct?.headers.get("If-Match")).toBe('"r0"');
      expect(correct?.headers.get("Idempotency-Key")).toBeTruthy();
      expect(correct?.body).toMatchObject({
        class_result_level: "MIXED",
      });
    });
  });

  it("stale CORRECT reloads and does not auto-submit", async () => {
    const user = userEvent.setup();
    let correctAttempts = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)
      ) {
        return mockJsonResponse(
          sampleAssessment({
            class_result_level: correctAttempts > 0 ? "MIXED" : "DEMONSTRATED",
            aggregate_revision: correctAttempts > 0 ? 1 : 0,
          }),
          { etag: correctAttempts > 0 ? '"r1"' : '"r0"' },
        );
      }
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments")
      ) {
        return mockJsonResponse({ items: [sampleAssessment()] });
      }
      if (call.url.includes("/actions/correct")) {
        correctAttempts += 1;
        return mockProblemResponse(412, "resource_revision_conflict");
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/assess?assessment_id=${ASSESSMENT_ID}`);
    await screen.findByRole("button", { name: /Correct assessment/i });
    await user.click(screen.getByRole("button", { name: /Correct assessment/i }));
    expect(
      await screen.findByText(/changed on the server/i),
    ).toBeInTheDocument();
    expect(
      calls.filter((call) => call.url.includes("/actions/correct")),
    ).toHaveLength(1);
  });

  it("VOID requires confirmation and sends If-Match + Idempotency-Key", async () => {
    const user = userEvent.setup();
    let voided = false;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/classroom-assessments/${ASSESSMENT_ID}`)
      ) {
        return mockJsonResponse(
          sampleAssessment(
            voided
              ? {
                  lifecycle_state: "VOIDED",
                  voided_at: "2026-09-03T12:00:00Z",
                  aggregate_revision: 1,
                }
              : undefined,
          ),
          { etag: voided ? '"r1"' : '"r0"' },
        );
      }
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments")
      ) {
        return mockJsonResponse({
          items: [
            sampleAssessment(
              voided
                ? {
                    lifecycle_state: "VOIDED",
                    voided_at: "2026-09-03T12:00:00Z",
                    aggregate_revision: 1,
                  }
                : undefined,
            ),
          ],
        });
      }
      if (call.url.includes("/actions/void")) {
        voided = true;
        return mockJsonResponse(
          sampleAssessment({
            lifecycle_state: "VOIDED",
            voided_at: "2026-09-03T12:00:00Z",
            aggregate_revision: 1,
          }),
          { etag: '"r1"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/assess?assessment_id=${ASSESSMENT_ID}`);
    await screen.findByRole("button", { name: /Void assessment/i });
    await user.click(screen.getByRole("button", { name: /Void assessment/i }));
    expect(
      screen.getByRole("group", { name: /Confirm void ClassroomAssessment/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Confirm void/i }));

    await waitFor(() => {
      const voidCall = calls.find((call) => call.url.includes("/actions/void"));
      expect(voidCall?.headers.get("If-Match")).toBe('"r0"');
      expect(voidCall?.headers.get("Idempotency-Key")).toBeTruthy();
    });
    expect(
      await screen.findByText(/Classroom assessment voided/i),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-state="VOIDED"]')).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Correct assessment/i }),
    ).not.toBeInTheDocument();
  });

  it("shows 403 fail-closed UX", async () => {
    const user = userEvent.setup();
    stubFetch((call) => {
      if (call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)) {
        return mockJsonResponse(sampleExecution());
      }
      if (
        call.method === "GET" &&
        call.url.includes("/api/v1/assessment/classroom-assessments")
      ) {
        return mockJsonResponse({ items: [] });
      }
      if (call.method === "POST") {
        return mockProblemResponse(403, "assessment_capability_forbidden");
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/assess?execution_id=${EXECUTION_ID}`);
    await screen.findByRole("button", { name: /Record class assessment/i });
    await user.click(
      screen.getByRole("button", { name: /Record class assessment/i }),
    );
    expect(
      await screen.findByText(/not authorized for this Assessment action/i),
    ).toBeInTheDocument();
  });

  it("shows empty state when completed execution has no eligible bindings", async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)) {
        return mockJsonResponse(
          sampleExecution({
            bindings: [
              {
                content_id: CONTENT_ID,
                content_version_id: VERSION_ID,
                artifact_kind: "teacher_notes",
              },
            ],
          }),
        );
      }
      if (call.url.includes("/api/v1/assessment/classroom-assessments")) {
        return mockJsonResponse({ items: [] });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/assess?execution_id=${EXECUTION_ID}`);
    expect(
      await screen.findByText(/No eligible assessment artifact/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Record class assessment/i }),
    ).not.toBeInTheDocument();
  });
});
