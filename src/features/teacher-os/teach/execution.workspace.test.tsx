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
const ARTIFACT_B_CONTENT = "00000002-1111-1111-1111-111111111111";
const ARTIFACT_B_VERSION = "00000002-2222-2222-2222-222222222222";

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

describe("TOS-DEV07-I03 Teach workspace", () => {
  it("loads work and class selectors then queries teach context with both params", async () => {
    const user = userEvent.setup();
    const calls = stubWorkspace();

    renderApp("/teacher-os/teach");
    expect(
      await screen.findByRole("heading", { name: "Teaching workspace" }),
    ).toBeInTheDocument();

    await user.selectOptions(
      await screen.findByLabelText("Teaching work"),
      WORK_ID,
    );
    await user.selectOptions(await screen.findByLabelText("Class"), "class-5a");

    await waitFor(() => {
      const contextCall = calls.find((call) =>
        call.url.includes("/teacher-os/teach/context"),
      );
      expect(contextCall).toBeDefined();
      expect(contextCall?.url).toContain(`work_id=${WORK_ID}`);
      expect(contextCall?.url).toContain("class_ref=class-5a");
    });

    expect(await screen.findByText("Teach context")).toBeInTheDocument();
    expect(screen.getAllByText("Grade 5A").length).toBeGreaterThan(0);
    expect(screen.getByText("Photosynthesis worksheet")).toBeInTheDocument();
  });

  it("starts with zero bindings and sends Idempotency-Key; retry preserves key", async () => {
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
        return mockJsonResponse(
          {
            execution_id: EXECUTION_ID,
            teacher_principal_id: "bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb",
            work_id: WORK_ID,
            class_ref: "class-5a",
            lifecycle_state: "IN_PROGRESS",
            started_at: "2026-09-03T10:00:00Z",
            completed_at: null,
            cancelled_at: null,
            bindings: [],
            observations: [],
            aggregate_revision: 0,
            created_at: "2026-09-03T10:00:00Z",
            updated_at: "2026-09-03T10:00:00Z",
          },
          { status: 201, etag: '"r0"' },
        );
      }
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(
          {
            execution_id: EXECUTION_ID,
            teacher_principal_id: "bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb",
            work_id: WORK_ID,
            class_ref: "class-5a",
            lifecycle_state: "IN_PROGRESS",
            started_at: "2026-09-03T10:00:00Z",
            completed_at: null,
            cancelled_at: null,
            bindings: [],
            observations: [],
            aggregate_revision: 0,
            created_at: "2026-09-03T10:00:00Z",
            updated_at: "2026-09-03T10:00:00Z",
          },
          { etag: '"r0"' },
        );
      }
      return null;
    });

    renderApp("/teacher-os/teach");
    await user.selectOptions(
      await screen.findByLabelText("Teaching work"),
      WORK_ID,
    );
    await user.selectOptions(screen.getByLabelText("Class"), "class-5a");
    await screen.findByRole("button", { name: "Start lesson" });

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
    expect(startCalls[0]?.body).toEqual({
      work_id: WORK_ID,
      class_ref: "class-5a",
      bindings: [],
    });
    expect(startCalls[0]?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(startCalls[1]?.headers.get("Idempotency-Key")).toBe(
      startCalls[0]?.headers.get("Idempotency-Key"),
    );
    expect(startCalls[1]?.body).toEqual(startCalls[0]?.body);
  });

  it("sends exact selected bindings payload", async () => {
    const user = userEvent.setup();
    const calls = stubWorkspace((call) => {
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/executions")
      ) {
        return mockJsonResponse(
          {
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
            observations: [],
            aggregate_revision: 0,
            created_at: "2026-09-03T10:00:00Z",
            updated_at: "2026-09-03T10:00:00Z",
          },
          { status: 201, etag: '"r0"' },
        );
      }
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)
      ) {
        return mockJsonResponse(
          {
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
            observations: [],
            aggregate_revision: 0,
            created_at: "2026-09-03T10:00:00Z",
            updated_at: "2026-09-03T10:00:00Z",
          },
          { etag: '"r0"' },
        );
      }
      return null;
    });

    renderApp("/teacher-os/teach");
    await user.selectOptions(
      await screen.findByLabelText("Teaching work"),
      WORK_ID,
    );
    await user.selectOptions(screen.getByLabelText("Class"), "class-5a");
    await screen.findByText("Photosynthesis worksheet");

    await user.click(
      screen.getByRole("checkbox", { name: /Bind Photosynthesis worksheet/i }),
    );
    await user.click(screen.getByRole("button", { name: "Start lesson" }));

    await waitFor(() => {
      const start = calls.find(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith("/api/v1/teaching/executions"),
      );
      expect(start?.body).toEqual({
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
      expect(start?.headers.get("Idempotency-Key")).toBeTruthy();
    });
  });
});
