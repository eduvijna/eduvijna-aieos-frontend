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

const EXECUTION_ID = "eeeeeeee-eeee-7eee-eeee-eeeeeeeeeeee";
const OBSERVATION_ID = "ffffffff-ffff-7fff-ffff-ffffffffffff";

function sampleExecution(overrides?: Record<string, unknown>) {
  return {
    execution_id: EXECUTION_ID,
    teacher_principal_id: "bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb",
    work_id: WORK_ID,
    class_ref: "class-5a",
    lifecycle_state: "IN_PROGRESS",
    started_at: "2026-09-03T10:00:00Z",
    completed_at: null,
    cancelled_at: null,
    bindings: [
      {
        content_id: CONTENT_ID,
        content_version_id: VERSION_ID,
        artifact_kind: "worksheet",
      },
    ],
    observations: [] as Record<string, unknown>[],
    aggregate_revision: 0,
    created_at: "2026-09-03T10:00:00Z",
    updated_at: "2026-09-03T10:00:00Z",
    ...overrides,
  };
}

function sampleObservation(overrides?: Record<string, unknown>) {
  return {
    observation_id: OBSERVATION_ID,
    execution_id: EXECUTION_ID,
    observation_kind: "PRIVATE_EXECUTION_NOTE",
    body: "First note",
    revision: 0,
    recorded_at: "2026-09-03T10:05:00Z",
    updated_at: "2026-09-03T10:05:00Z",
    ...overrides,
  };
}

describe("TOS-DEV07-I03 Execution detail", () => {
  it("reloads durable execution by id with lifecycle, bindings, revision", async () => {
    stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(sampleExecution(), { etag: '"r0"' });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    expect(await screen.findByText(/IN_PROGRESS/)).toBeInTheDocument();
    expect(screen.getByText(WORK_ID)).toBeInTheDocument();
    expect(screen.getByText("class-5a")).toBeInTheDocument();
    expect(screen.getByText("worksheet")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("offers only PRIVATE_EXECUTION_NOTE and CLASS_OBSERVATION kinds", async () => {
    stubFetch((call) => {
      if (call.url.includes(`/executions/${EXECUTION_ID}`)) {
        return mockJsonResponse(sampleExecution(), { etag: '"r0"' });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    const kindSelect = await screen.findByLabelText("Observation kind");
    const options = Array.from(kindSelect.querySelectorAll("option")).map(
      (option) => option.getAttribute("value"),
    );
    expect(options).toEqual([
      "PRIVATE_EXECUTION_NOTE",
      "CLASS_OBSERVATION",
    ]);
    expect(screen.queryByLabelText(/learner/i)).not.toBeInTheDocument();
  });

  it("creates observation with Idempotency-Key", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        detailGets += 1;
        const observations =
          detailGets > 2
            ? [sampleObservation()]
            : [];
        return mockJsonResponse(
          sampleExecution({
            observations,
            aggregate_revision: 0,
          }),
          { etag: '"r0"' },
        );
      }
      if (
        call.method === "POST" &&
        call.url.endsWith(
          `/api/v1/teaching/executions/${EXECUTION_ID}/observations`,
        )
      ) {
        return mockJsonResponse(sampleObservation(), {
          status: 201,
          etag: '"r0"',
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await screen.findByLabelText("Observation note");
    await user.type(screen.getByLabelText("Observation note"), "First note");
    await user.click(
      screen.getByRole("button", { name: "Record observation" }),
    );
    expect(await screen.findByText(/Observation recorded/i)).toBeInTheDocument();

    const create = calls.find(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith(
          `/api/v1/teaching/executions/${EXECUTION_ID}/observations`,
        ),
    );
    expect(create?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(create?.body).toEqual({
      observation_kind: "PRIVATE_EXECUTION_NOTE",
      body: "First note",
    });
  });

  it("corrects observation with If-Match from observation revision", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        detailGets += 1;
        return mockJsonResponse(
          sampleExecution({
            observations: [
              sampleObservation({
                body: detailGets > 3 ? "Corrected note" : "First note",
                revision: detailGets > 3 ? 1 : 0,
              }),
            ],
          }),
          { etag: '"r0"' },
        );
      }
      if (call.method === "PATCH") {
        return mockJsonResponse(
          sampleObservation({ body: "Corrected note", revision: 1 }),
          { etag: '"r1"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(await screen.findByRole("button", { name: "Correct" }));
    const draft = screen.getByLabelText("Corrected observation text");
    await user.clear(draft);
    await user.type(draft, "Corrected note");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(
      await screen.findByText(/Observation corrected/i),
    ).toBeInTheDocument();

    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.headers.get("If-Match")).toBe('"r0"');
    expect(patch?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(patch?.body).toEqual({ body: "Corrected note" });
  });

  it("412 reloads and informs without silent second mutation", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    let patched = 0;
    stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        detailGets += 1;
        return mockJsonResponse(
          sampleExecution({
            observations: [sampleObservation({ revision: detailGets > 1 ? 1 : 0 })],
            aggregate_revision: detailGets > 1 ? 1 : 0,
          }),
          { etag: detailGets > 1 ? '"r1"' : '"r0"' },
        );
      }
      if (call.method === "PATCH") {
        patched += 1;
        return mockProblemResponse(
          412,
          "teaching_execution_observation_revision_conflict",
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(await screen.findByRole("button", { name: "Correct" }));
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(
      await screen.findByText(/Latest state was reloaded/i),
    ).toBeInTheDocument();
    expect(patched).toBe(1);
    expect(detailGets).toBeGreaterThanOrEqual(2);
  });

  it("complete and cancel send fresh If-Match and Idempotency-Key", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        detailGets += 1;
        const etag = detailGets === 1 ? '"r0"' : '"r1"';
        return mockJsonResponse(sampleExecution(), { etag });
      }
      if (call.url.endsWith("/actions/complete")) {
        return mockJsonResponse(
          sampleExecution({
            lifecycle_state: "COMPLETED",
            completed_at: "2026-09-03T11:00:00Z",
            aggregate_revision: 1,
          }),
          { etag: '"r2"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(
      await screen.findByRole("button", { name: "Complete lesson" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm complete" }),
    );
    expect(await screen.findByText(/Lesson completed/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/does not mutate related TeachingAssignments/i)
        .length,
    ).toBeGreaterThan(0);

    const complete = calls.find((call) =>
      call.url.endsWith("/actions/complete"),
    );
    expect(complete?.headers.get("If-Match")).toBe('"r1"');
    expect(complete?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(detailGets).toBeGreaterThanOrEqual(2);
  });

  it("cancel confirmation uses fresh pre-cancel GET ETag", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        detailGets += 1;
        const etag = detailGets === 1 ? '"r0"' : '"r3"';
        return mockJsonResponse(sampleExecution(), { etag });
      }
      if (call.url.endsWith("/actions/cancel")) {
        return mockJsonResponse(
          sampleExecution({
            lifecycle_state: "CANCELLED",
            cancelled_at: "2026-09-03T11:30:00Z",
            aggregate_revision: 1,
          }),
          { etag: '"r4"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(
      await screen.findByRole("button", { name: "Cancel lesson" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm cancel" }));
    expect(await screen.findByText(/Lesson cancelled/i)).toBeInTheDocument();

    const cancel = calls.find((call) => call.url.endsWith("/actions/cancel"));
    expect(cancel?.headers.get("If-Match")).toBe('"r3"');
    expect(cancel?.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("terminal state is immutable — no new observations or complete/cancel", async () => {
    stubFetch((call) => {
      if (call.url.includes(`/executions/${EXECUTION_ID}`)) {
        return mockJsonResponse(
          sampleExecution({
            lifecycle_state: "COMPLETED",
            completed_at: "2026-09-03T11:00:00Z",
            observations: [sampleObservation()],
            aggregate_revision: 1,
          }),
          { etag: '"r1"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: /Completed/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("First note")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record observation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Correct" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Complete lesson" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel lesson" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it("403 ClassRef fails closed", async () => {
    stubFetch((call) => {
      if (call.url.includes(`/executions/${EXECUTION_ID}`)) {
        return mockProblemResponse(403, "class_ref_not_assignable");
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    expect(await screen.findByText(/Failed closed/i)).toBeInTheDocument();
  });

  it("503 on complete is recoverable and preserves Idempotency-Key", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    let completeAttempts = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        detailGets += 1;
        return mockJsonResponse(sampleExecution(), {
          etag: detailGets === 1 ? '"r0"' : '"r1"',
        });
      }
      if (call.url.endsWith("/actions/complete")) {
        completeAttempts += 1;
        if (completeAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(
          sampleExecution({
            lifecycle_state: "COMPLETED",
            completed_at: "2026-09-03T11:00:00Z",
            aggregate_revision: 1,
          }),
          { etag: '"r2"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(
      await screen.findByRole("button", { name: "Complete lesson" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm complete" }),
    );
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Complete lesson" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm complete" }),
    );
    await waitFor(() => {
      expect(
        calls.filter((call) => call.url.endsWith("/actions/complete")),
      ).toHaveLength(2);
    });

    const completeCalls = calls.filter((call) =>
      call.url.endsWith("/actions/complete"),
    );
    expect(completeCalls[0]?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(completeCalls[1]?.headers.get("Idempotency-Key")).toBe(
      completeCalls[0]?.headers.get("Idempotency-Key"),
    );
  });
});
