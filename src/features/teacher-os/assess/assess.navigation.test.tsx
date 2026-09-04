import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CONTENT_ID,
  mockJsonResponse,
  renderApp,
  stubFetch,
  VERSION_ID,
  WORK_ID,
} from "@/test/test-utils";

const EXECUTION_ID = "eeeeeeee-eeee-7eee-eeee-eeeeeeeeeeee";

describe("TOS-DEV08-I03 Teach → Assess navigation", () => {
  it("offers Assess this class only for COMPLETED executions as navigation", async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)) {
        return mockJsonResponse(
          {
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
                artifact_kind: "quiz",
              },
            ],
            observations: [],
            aggregate_revision: 1,
            created_at: "2026-09-03T10:00:00Z",
            updated_at: "2026-09-03T10:45:00Z",
          },
          { etag: '"r1"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    const link = await screen.findByRole("link", {
      name: /Assess this class/i,
    });
    expect(link).toHaveAttribute(
      "href",
      `/teacher-os/assess?execution_id=${EXECUTION_ID}`,
    );
    expect(screen.getByText(/Navigation only/i)).toBeInTheDocument();
  });

  it("does not offer Assess this class for IN_PROGRESS executions", async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/api/v1/teaching/executions/${EXECUTION_ID}`)) {
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
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/executions/${EXECUTION_ID}`);
    await screen.findByText(/IN_PROGRESS/);
    expect(
      screen.queryByRole("link", { name: /Assess this class/i }),
    ).not.toBeInTheDocument();
  });
});
