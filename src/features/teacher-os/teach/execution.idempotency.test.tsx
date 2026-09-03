import { screen, waitFor } from "@testing-library/react";
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

const EXECUTION_ID = "eeeeeeee-eeee-7eee-eeee-eeeeeeeeeeee";
const EXECUTION_ID_B = "eeeeeeee-eeee-7eee-eeee-eeeeeeeeeeeb";
const OBSERVATION_ID = "ffffffff-ffff-7fff-ffff-ffffffffffff";
const ARTIFACT_B_CONTENT = "00000002-1111-1111-1111-111111111111";
const ARTIFACT_B_VERSION = "00000002-2222-2222-2222-222222222222";

function sampleExecution(
  overrides?: Record<string, unknown>,
  revision = 0,
) {
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
    aggregate_revision: revision,
    created_at: "2026-09-03T10:00:00Z",
    updated_at: "2026-09-03T10:00:00Z",
    ...overrides,
  };
}

function sampleObservation(
  overrides?: Record<string, unknown>,
  revision = 0,
) {
  return {
    observation_id: OBSERVATION_ID,
    execution_id: EXECUTION_ID,
    observation_kind: "PRIVATE_EXECUTION_NOTE",
    body: "First note",
    revision,
    recorded_at: "2026-09-03T10:05:00Z",
    updated_at: "2026-09-03T10:05:00Z",
    ...overrides,
  };
}

function etagFor(revision: number): string {
  return `"r${revision}"`;
}

function sampleTeachContext(overrides?: Record<string, unknown>) {
  return {
    work: {
      work_id: WORK_ID,
      intent_type: "prepare_tomorrow",
      goal_text: sampleWork.goal_text,
      class_label: sampleWork.class_label,
      subject: sampleWork.subject,
      topic: sampleWork.topic,
      target_date: sampleWork.target_date,
      aggregate_revision: 1,
      updated_at: sampleWork.updated_at,
    },
    class_ref: "class-5a",
    display_label: "Grade 5A",
    artifacts: [
      {
        content_id: CONTENT_ID,
        version_id: VERSION_ID,
        content_type: "worksheet",
        title: "Photosynthesis worksheet",
        origin: "AI",
        stewardship_state: "APPROVED",
        aggregate_revision: 1,
        artifact_kind: "worksheet",
      },
      {
        content_id: ARTIFACT_B_CONTENT,
        version_id: ARTIFACT_B_VERSION,
        content_type: "quiz",
        title: "Photosynthesis quiz",
        origin: "AI",
        stewardship_state: "APPROVED",
        aggregate_revision: 1,
        artifact_kind: "quiz",
      },
    ],
    assignments: [],
    executions: [],
    ...overrides,
  };
}

function stubWorkspace(handler?: (call: {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}) => Response | null) {
  return stubFetch((call) => {
    const custom = handler?.(call);
    if (custom) return custom;

    if (
      call.method === "GET" &&
      call.url.startsWith("/api/v1/teaching/works")
    ) {
      return mockJsonResponse({ items: [sampleWork], has_more: false });
    }
    if (call.url.includes("/teacher-os/school-context/classes")) {
      return mockJsonResponse({
        items: [
          { class_ref: "class-5a", display_label: "Grade 5A" },
          { class_ref: "class-5b", display_label: "Grade 5B" },
        ],
      });
    }
    if (
      call.method === "GET" &&
      call.url.endsWith("/api/v1/teaching/assignments")
    ) {
      return mockJsonResponse({ items: [], has_more: false });
    }
    if (call.url.includes("/teacher-os/teach/context")) {
      return mockJsonResponse(sampleTeachContext());
    }
    return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
  });
}

async function selectWorkAndClass(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    await screen.findByLabelText("Teaching work"),
    WORK_ID,
  );
  await user.selectOptions(await screen.findByLabelText("Class"), "class-5a");
  await screen.findByRole("button", { name: "Start lesson" });
}

describe("TOS-DEV07-I03R1 Execution idempotency (13 cases)", () => {
  it("1 — START retry with identical request preserves Idempotency-Key", async () => {
    const user = userEvent.setup();
    let startAttempts = 0;
    const calls = stubWorkspace((call) => {
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/executions")
      ) {
        startAttempts += 1;
        if (startAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(sampleExecution(), {
          status: 201,
          etag: etagFor(0),
        });
      }
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(sampleExecution(), { etag: etagFor(0) });
      }
      return null;
    });

    renderApp("/teacher-os/teach");
    await selectWorkAndClass(user);
    await user.click(screen.getByRole("button", { name: "Start lesson" }));
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start lesson" }));

    await waitFor(() => {
      expect(
        calls.filter(
          (call) =>
            call.method === "POST" &&
            call.url.endsWith("/api/v1/teaching/executions"),
        ),
      ).toHaveLength(2);
    });
    const startCalls = calls.filter(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/executions"),
    );
    expect(startCalls[0]?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(startCalls[1]?.headers.get("Idempotency-Key")).toBe(
      startCalls[0]?.headers.get("Idempotency-Key"),
    );
    expect(startCalls[1]?.body).toEqual(startCalls[0]?.body);
  });

  it("2 — START material change mints a new Idempotency-Key", async () => {
    const user = userEvent.setup();
    let startAttempts = 0;
    const calls = stubWorkspace((call) => {
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/executions")
      ) {
        startAttempts += 1;
        if (startAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(sampleExecution(), {
          status: 201,
          etag: etagFor(0),
        });
      }
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(sampleExecution(), { etag: etagFor(0) });
      }
      return null;
    });

    renderApp("/teacher-os/teach");
    await selectWorkAndClass(user);
    await user.click(screen.getByRole("button", { name: "Start lesson" }));
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: /Bind Photosynthesis worksheet/i }),
    );
    await user.click(screen.getByRole("button", { name: "Start lesson" }));

    await waitFor(() => {
      expect(
        calls.filter(
          (call) =>
            call.method === "POST" &&
            call.url.endsWith("/api/v1/teaching/executions"),
        ),
      ).toHaveLength(2);
    });
    const startCalls = calls.filter(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/executions"),
    );
    expect(startCalls[0]?.body).toEqual({
      work_id: WORK_ID,
      class_ref: "class-5a",
      bindings: [],
    });
    expect(startCalls[1]?.body).toEqual({
      work_id: WORK_ID,
      class_ref: "class-5a",
      bindings: [
        {
          content_id: CONTENT_ID,
          content_version_id: VERSION_ID,
          artifact_kind: "worksheet",
        },
      ],
    });
    expect(startCalls[0]?.headers.get("Idempotency-Key")).not.toEqual(
      startCalls[1]?.headers.get("Idempotency-Key"),
    );
  });

  it("3 — Observation create retry with same execution/kind/body preserves key", async () => {
    const user = userEvent.setup();
    let createAttempts = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(sampleExecution(), { etag: etagFor(0) });
      }
      if (
        call.method === "POST" &&
        call.url.endsWith(
          `/api/v1/teaching/executions/${EXECUTION_ID}/observations`,
        )
      ) {
        createAttempts += 1;
        if (createAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(sampleObservation(), {
          status: 201,
          etag: etagFor(0),
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
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Record observation" }),
    );

    await waitFor(() => {
      expect(
        calls.filter(
          (call) =>
            call.method === "POST" &&
            call.url.endsWith(
              `/api/v1/teaching/executions/${EXECUTION_ID}/observations`,
            ),
        ),
      ).toHaveLength(2);
    });
    const creates = calls.filter(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith(
          `/api/v1/teaching/executions/${EXECUTION_ID}/observations`,
        ),
    );
    expect(creates[0]?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(creates[1]?.headers.get("Idempotency-Key")).toBe(
      creates[0]?.headers.get("Idempotency-Key"),
    );
  });

  it("4 — Observation create for a different execution cannot reuse prior key", async () => {
    const user = userEvent.setup();
    const keys: string[] = [];

    stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(sampleExecution(), { etag: etagFor(0) });
      }
      if (
        call.method === "POST" &&
        call.url.endsWith(
          `/api/v1/teaching/executions/${EXECUTION_ID}/observations`,
        )
      ) {
        keys.push(call.headers.get("Idempotency-Key") ?? "");
        return mockProblemResponse(503, "school_context_unavailable");
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    const { unmount } = renderApp(
      `/teacher-os/teach/executions/${EXECUTION_ID}`,
    );
    await screen.findByLabelText("Observation note");
    await user.type(screen.getByLabelText("Observation note"), "Shared body");
    await user.click(
      screen.getByRole("button", { name: "Record observation" }),
    );
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    unmount();

    stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID_B}`)
      ) {
        return mockJsonResponse(
          sampleExecution({ execution_id: EXECUTION_ID_B }),
          { etag: etagFor(0) },
        );
      }
      if (
        call.method === "POST" &&
        call.url.endsWith(
          `/api/v1/teaching/executions/${EXECUTION_ID_B}/observations`,
        )
      ) {
        keys.push(call.headers.get("Idempotency-Key") ?? "");
        return mockProblemResponse(503, "school_context_unavailable");
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID_B}`);
    await screen.findByLabelText("Observation note");
    await user.type(screen.getByLabelText("Observation note"), "Shared body");
    await user.click(
      screen.getByRole("button", { name: "Record observation" }),
    );
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[0]).not.toEqual(keys[1]);
  });

  it("5 — Observation correct retry with identical material preserves key", async () => {
    const user = userEvent.setup();
    let correctAttempts = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(
          sampleExecution({
            observations: [sampleObservation(undefined, 0)],
            aggregate_revision: 0,
          }),
          { etag: etagFor(0) },
        );
      }
      if (call.method === "PATCH") {
        correctAttempts += 1;
        if (correctAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(sampleObservation({ body: "Corrected" }, 1), {
          etag: etagFor(1),
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(await screen.findByRole("button", { name: "Correct" }));
    const draft = screen.getByLabelText("Corrected observation text");
    await user.clear(draft);
    await user.type(draft, "Corrected");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();

    // Form stays open after recoverable 503 — retry Save with same material.
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => {
      expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(2);
    });
    const patches = calls.filter((call) => call.method === "PATCH");
    expect(patches[0]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(patches[1]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(patches[0]?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(patches[1]?.headers.get("Idempotency-Key")).toBe(
      patches[0]?.headers.get("Idempotency-Key"),
    );
  });

  it("6 — Observation correct with changed revision aborts retry; new deliberate save mints new key", async () => {
    const user = userEvent.setup();
    let correctAttempts = 0;
    let detailGets = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        detailGets += 1;
        // After first failed correct, subsequent fresh GETs show revision 1.
        const obsRevision = correctAttempts >= 1 ? 1 : 0;
        return mockJsonResponse(
          sampleExecution({
            observations: [
              sampleObservation(
                { body: obsRevision === 0 ? "First note" : "Server updated" },
                obsRevision,
              ),
            ],
            aggregate_revision: obsRevision,
          }),
          { etag: etagFor(obsRevision) },
        );
      }
      if (call.method === "PATCH") {
        correctAttempts += 1;
        if (correctAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(
          sampleObservation({ body: "Deliberate corrected" }, 2),
          { etag: etagFor(2) },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(await screen.findByRole("button", { name: "Correct" }));
    const draft = screen.getByLabelText("Corrected observation text");
    await user.clear(draft);
    await user.type(draft, "Corrected");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();

    // Recoverable retry with changed revision must NOT PATCH again.
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(
      await screen.findByText(/observation changed since your last attempt/i),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);

    // New deliberate correction after review.
    const draft2 = screen.getByLabelText("Corrected observation text");
    await user.clear(draft2);
    await user.type(draft2, "Deliberate corrected");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => {
      expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(2);
    });
    const patches = calls.filter((call) => call.method === "PATCH");
    expect(patches[0]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(patches[1]?.headers.get("If-Match")).toBe(etagFor(1));
    expect(patches[0]?.headers.get("Idempotency-Key")).not.toEqual(
      patches[1]?.headers.get("Idempotency-Key"),
    );
    expect(detailGets).toBeGreaterThanOrEqual(3);
  });

  it("7 — Observation correct with changed body aborts retry; renewed deliberate save uses new key", async () => {
    const user = userEvent.setup();
    let correctAttempts = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(
          sampleExecution({
            observations: [sampleObservation(undefined, 0)],
            aggregate_revision: 0,
          }),
          { etag: etagFor(0) },
        );
      }
      if (call.method === "PATCH") {
        correctAttempts += 1;
        if (correctAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(
          sampleObservation({ body: "Second body" }, 1),
          { etag: etagFor(1) },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(await screen.findByRole("button", { name: "Correct" }));
    const draft = screen.getByLabelText("Corrected observation text");
    await user.clear(draft);
    await user.type(draft, "First body");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();

    const draft2 = screen.getByLabelText("Corrected observation text");
    await user.clear(draft2);
    await user.type(draft2, "Second body");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(
      await screen.findByText(/observation changed since your last attempt/i),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);

    const draft3 = screen.getByLabelText("Corrected observation text");
    await user.clear(draft3);
    await user.type(draft3, "Second body");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => {
      expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(2);
    });
    const patches = calls.filter((call) => call.method === "PATCH");
    expect(patches[0]?.body).toEqual({ body: "First body" });
    expect(patches[1]?.body).toEqual({ body: "Second body" });
    expect(patches[0]?.headers.get("Idempotency-Key")).not.toEqual(
      patches[1]?.headers.get("Idempotency-Key"),
    );
  });

  it("8 — 412 correction reloads and does not silently mutate with stale key", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    let patched = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        detailGets += 1;
        const revision = patched > 0 ? 1 : 0;
        return mockJsonResponse(
          sampleExecution({
            observations: [
              sampleObservation(
                { body: revision === 0 ? "First note" : "Server won" },
                revision,
              ),
            ],
            aggregate_revision: revision,
          }),
          { etag: etagFor(revision) },
        );
      }
      if (call.method === "PATCH") {
        patched += 1;
        if (patched === 1) {
          return mockProblemResponse(
            412,
            "teaching_execution_observation_revision_conflict",
          );
        }
        return mockJsonResponse(
          sampleObservation({ body: "Deliberate after reload" }, 2),
          { etag: etagFor(2) },
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

    // Deliberate second correction after reload — must mint a new key (no auto-replay).
    const draft = screen.getByLabelText("Corrected observation text");
    await user.clear(draft);
    await user.type(draft, "Deliberate after reload");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => {
      expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(2);
    });
    const patches = calls.filter((call) => call.method === "PATCH");
    expect(patches[0]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(patches[1]?.headers.get("If-Match")).toBe(etagFor(1));
    expect(patches[0]?.headers.get("Idempotency-Key")).not.toEqual(
      patches[1]?.headers.get("Idempotency-Key"),
    );
    expect(patched).toBe(2);
  });

  it("9 — Complete retry with same fresh revision preserves key", async () => {
    const user = userEvent.setup();
    let completeAttempts = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(sampleExecution(undefined, 0), {
          etag: etagFor(0),
        });
      }
      if (call.url.endsWith("/actions/complete")) {
        completeAttempts += 1;
        if (completeAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(
          sampleExecution(
            {
              lifecycle_state: "COMPLETED",
              completed_at: "2026-09-03T11:00:00Z",
            },
            1,
          ),
          { etag: etagFor(1) },
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
    const completes = calls.filter((call) =>
      call.url.endsWith("/actions/complete"),
    );
    expect(completes[0]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(completes[1]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(completes[0]?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(completes[1]?.headers.get("Idempotency-Key")).toBe(
      completes[0]?.headers.get("Idempotency-Key"),
    );
  });

  it("10 — Complete with changed fresh revision aborts retry; renewed confirm uses new key", async () => {
    const user = userEvent.setup();
    let completeAttempts = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        const revision = completeAttempts >= 1 ? 1 : 0;
        return mockJsonResponse(sampleExecution(undefined, revision), {
          etag: etagFor(revision),
        });
      }
      if (call.url.endsWith("/actions/complete")) {
        completeAttempts += 1;
        if (completeAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(
          sampleExecution(
            {
              lifecycle_state: "COMPLETED",
              completed_at: "2026-09-03T11:00:00Z",
            },
            2,
          ),
          { etag: etagFor(2) },
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
    expect(
      await screen.findByText(/TeachingExecution changed since your last attempt/i),
    ).toBeInTheDocument();
    expect(
      calls.filter((call) => call.url.endsWith("/actions/complete")),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Confirm complete" }),
    ).not.toBeInTheDocument();

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
    const completes = calls.filter((call) =>
      call.url.endsWith("/actions/complete"),
    );
    expect(completes[0]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(completes[1]?.headers.get("If-Match")).toBe(etagFor(1));
    expect(completes[0]?.headers.get("Idempotency-Key")).not.toEqual(
      completes[1]?.headers.get("Idempotency-Key"),
    );
  });

  it("11 — Cancel retry with same fresh revision preserves key", async () => {
    const user = userEvent.setup();
    let cancelAttempts = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(sampleExecution(undefined, 0), {
          etag: etagFor(0),
        });
      }
      if (call.url.endsWith("/actions/cancel")) {
        cancelAttempts += 1;
        if (cancelAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(
          sampleExecution(
            {
              lifecycle_state: "CANCELLED",
              cancelled_at: "2026-09-03T11:30:00Z",
            },
            1,
          ),
          { etag: etagFor(1) },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(
      await screen.findByRole("button", { name: "Cancel lesson" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm cancel" }));
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Cancel lesson" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm cancel" }));

    await waitFor(() => {
      expect(
        calls.filter((call) => call.url.endsWith("/actions/cancel")),
      ).toHaveLength(2);
    });
    const cancels = calls.filter((call) =>
      call.url.endsWith("/actions/cancel"),
    );
    expect(cancels[0]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(cancels[1]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(cancels[0]?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(cancels[1]?.headers.get("Idempotency-Key")).toBe(
      cancels[0]?.headers.get("Idempotency-Key"),
    );
  });

  it("12 — Cancel with changed fresh revision aborts retry; renewed confirm uses new key", async () => {
    const user = userEvent.setup();
    let cancelAttempts = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        const revision = cancelAttempts >= 1 ? 1 : 0;
        return mockJsonResponse(sampleExecution(undefined, revision), {
          etag: etagFor(revision),
        });
      }
      if (call.url.endsWith("/actions/cancel")) {
        cancelAttempts += 1;
        if (cancelAttempts === 1) {
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(
          sampleExecution(
            {
              lifecycle_state: "CANCELLED",
              cancelled_at: "2026-09-03T11:30:00Z",
            },
            2,
          ),
          { etag: etagFor(2) },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await user.click(
      await screen.findByRole("button", { name: "Cancel lesson" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm cancel" }));
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Cancel lesson" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm cancel" }));
    expect(
      await screen.findByText(/TeachingExecution changed since your last attempt/i),
    ).toBeInTheDocument();
    expect(
      calls.filter((call) => call.url.endsWith("/actions/cancel")),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Confirm cancel" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Cancel lesson" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm cancel" }));

    await waitFor(() => {
      expect(
        calls.filter((call) => call.url.endsWith("/actions/cancel")),
      ).toHaveLength(2);
    });
    const cancels = calls.filter((call) =>
      call.url.endsWith("/actions/cancel"),
    );
    expect(cancels[0]?.headers.get("If-Match")).toBe(etagFor(0));
    expect(cancels[1]?.headers.get("If-Match")).toBe(etagFor(1));
    expect(cancels[0]?.headers.get("Idempotency-Key")).not.toEqual(
      cancels[1]?.headers.get("Idempotency-Key"),
    );
  });

  it("13 — Terminal state prevents further mutation", async () => {
    stubFetch((call) => {
      if (call.url.includes(`/executions/${EXECUTION_ID}`)) {
        return mockJsonResponse(
          sampleExecution(
            {
              lifecycle_state: "COMPLETED",
              completed_at: "2026-09-03T11:00:00Z",
              observations: [sampleObservation(undefined, 0)],
            },
            1,
          ),
          { etag: etagFor(1) },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: /Completed/i }),
    ).toBeInTheDocument();
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
});
