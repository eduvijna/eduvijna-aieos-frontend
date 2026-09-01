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

const ASSIGNMENT_ID = "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa";

function sampleAssignment(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
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

describe("TOS-DEV06-I04 Teach list", () => {
  it("shows loading then empty state", async () => {
    stubFetch((call) => {
      if (call.url.includes("/api/v1/teaching/assignments")) {
        return mockJsonResponse({ items: [], has_more: false });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp("/teacher-os/teach");
    expect(await screen.findByText("No assignments yet")).toBeInTheDocument();
  });

  it("lists ACTIVE/CLOSED/CANCELLED and source artifact link", async () => {
    stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith("/api/v1/teaching/assignments")
      ) {
        return mockJsonResponse({
          items: [
            sampleAssignment({ lifecycle_state: "ACTIVE" }),
            sampleAssignment({
              assignment_id: "cccccccc-cccc-7ccc-cccc-cccccccccccc",
              lifecycle_state: "CLOSED",
              closed_at: "2026-09-02T10:00:00Z",
              aggregate_revision: 1,
              source_work_id: null,
            }),
            sampleAssignment({
              assignment_id: "dddddddd-dddd-7ddd-dddd-dddddddddddd",
              lifecycle_state: "CANCELLED",
              cancelled_at: "2026-09-02T11:00:00Z",
              aggregate_revision: 1,
            }),
          ],
          has_more: false,
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp("/teacher-os/teach");
    expect(await screen.findAllByText("ACTIVE")).toHaveLength(1);
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
    expect(screen.getByText("CANCELLED")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Open artifact" })[0],
    ).toHaveAttribute(
      "href",
      `/teacher-os/work/${WORK_ID}/artifacts/${CONTENT_ID}/versions/${VERSION_ID}`,
    );
  });
});

describe("TOS-DEV06-I04 Assignment detail mutations", () => {
  it("ACTIVE exposes due/close/cancel; fresh GET precedes PATCH with fresh If-Match", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        detailGets += 1;
        const etag = detailGets === 1 ? '"r0"' : '"r1"';
        return mockJsonResponse(sampleAssignment(), { etag });
      }
      if (
        call.method === "PATCH" &&
        call.url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        return mockJsonResponse(
          sampleAssignment({
            due_at: null,
            aggregate_revision: 1,
          }),
          { etag: '"r2"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    expect(
      await screen.findByRole("button", { name: "Update due date" }),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Due date/i));
    await user.click(screen.getByRole("button", { name: "Update due date" }));
    expect(await screen.findByText(/Due date updated/i)).toBeInTheDocument();

    expect(detailGets).toBeGreaterThanOrEqual(2);
    const patchIndex = calls.findIndex((call) => call.method === "PATCH");
    const lastPrePatchGet = calls
      .slice(0, patchIndex)
      .filter(
        (call) =>
          call.method === "GET" &&
          call.url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`),
      )
      .at(-1);
    expect(lastPrePatchGet).toBeDefined();
    const patch = calls[patchIndex];
    expect(patch?.headers.get("If-Match")).toBe('"r1"');
    expect(patch?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(patch?.body).toEqual({ due_at: null });
  });

  it("412 reloads and informs without silent second mutation", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    let patched = 0;
    stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        detailGets += 1;
        const etag =
          detailGets === 1 ? '"r0"' : patched > 0 ? '"r2"' : '"r1"';
        return mockJsonResponse(
          sampleAssignment({
            due_at:
              patched > 0 ? "2026-09-09T10:00:00Z" : "2026-09-08T10:00:00Z",
            aggregate_revision: patched > 0 ? 2 : detailGets === 1 ? 0 : 1,
          }),
          { etag },
        );
      }
      if (call.method === "PATCH") {
        patched += 1;
        return mockProblemResponse(412, "aggregate_revision_conflict");
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    await screen.findByRole("button", { name: "Update due date" });
    await user.click(screen.getByRole("button", { name: "Update due date" }));
    expect(
      await screen.findByText(/Latest state was reloaded/i),
    ).toBeInTheDocument();
    expect(patched).toBe(1);
    expect(detailGets).toBeGreaterThanOrEqual(2);
  });

  it("close confirmation uses fresh pre-close GET ETag", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        detailGets += 1;
        const etag = detailGets === 1 ? '"r0"' : '"r3"';
        return mockJsonResponse(sampleAssignment(), { etag });
      }
      if (call.url.endsWith(`/actions/close`)) {
        return mockJsonResponse(
          sampleAssignment({
            lifecycle_state: "CLOSED",
            closed_at: "2026-09-02T10:00:00Z",
            aggregate_revision: 1,
          }),
          { etag: '"r4"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    await user.click(
      await screen.findByRole("button", { name: "Close assignment" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm close" }));
    expect(await screen.findByText(/Assignment closed/i)).toBeInTheDocument();

    const closeCall = calls.find((call) => call.url.endsWith("/actions/close"));
    expect(closeCall?.headers.get("If-Match")).toBe('"r3"');
    expect(closeCall?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(detailGets).toBeGreaterThanOrEqual(2);
  });

  it("cancel confirmation uses fresh pre-cancel GET ETag", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        detailGets += 1;
        const etag = detailGets === 1 ? '"r0"' : '"r4"';
        return mockJsonResponse(sampleAssignment(), { etag });
      }
      if (call.url.endsWith(`/actions/cancel`)) {
        return mockJsonResponse(
          sampleAssignment({
            lifecycle_state: "CANCELLED",
            cancelled_at: "2026-09-02T11:00:00Z",
            aggregate_revision: 1,
          }),
          { etag: '"r5"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    await user.click(
      await screen.findByRole("button", { name: "Cancel assignment" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm cancel" }));
    expect(
      await screen.findByText(/Assignment cancelled/i),
    ).toBeInTheDocument();

    const cancelCall = calls.find((call) =>
      call.url.endsWith("/actions/cancel"),
    );
    expect(cancelCall?.headers.get("If-Match")).toBe('"r4"');
    expect(cancelCall?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(detailGets).toBeGreaterThanOrEqual(2);
  });

  it("aborts close when fresh GET already shows CLOSED", async () => {
    const user = userEvent.setup();
    let detailGets = 0;
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        detailGets += 1;
        if (detailGets === 1) {
          return mockJsonResponse(sampleAssignment(), { etag: '"r0"' });
        }
        return mockJsonResponse(
          sampleAssignment({
            lifecycle_state: "CLOSED",
            closed_at: "2026-09-02T10:00:00Z",
            aggregate_revision: 1,
          }),
          { etag: '"r1"' },
        );
      }
      if (call.url.endsWith("/actions/close")) {
        return mockJsonResponse(sampleAssignment(), { status: 500 });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    await user.click(
      await screen.findByRole("button", { name: "Close assignment" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm close" }));
    expect(
      await screen.findByText(/Latest state was loaded/i),
    ).toBeInTheDocument();
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update due date" }),
    ).not.toBeInTheDocument();
    expect(
      calls.filter((call) => call.url.endsWith("/actions/close")),
    ).toHaveLength(0);
    expect(detailGets).toBe(2);
  });

  it("CLOSED assignment exposes no mutation controls", async () => {
    stubFetch((call) => {
      if (call.url.includes(`/assignments/${ASSIGNMENT_ID}`)) {
        return mockJsonResponse(
          sampleAssignment({
            lifecycle_state: "CLOSED",
            closed_at: "2026-09-02T10:00:00Z",
            aggregate_revision: 1,
          }),
          { etag: '"r1"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    await screen.findByText("CLOSED");
    expect(
      screen.queryByRole("button", { name: "Update due date" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close assignment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel assignment" }),
    ).not.toBeInTheDocument();
  });

  it("CANCELLED assignment exposes no mutation controls", async () => {
    stubFetch((call) => {
      if (call.url.includes(`/assignments/${ASSIGNMENT_ID}`)) {
        return mockJsonResponse(
          sampleAssignment({
            lifecycle_state: "CANCELLED",
            cancelled_at: "2026-09-02T11:00:00Z",
            aggregate_revision: 1,
          }),
          { etag: '"r1"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    await screen.findByText("CANCELLED");
    expect(
      screen.queryByRole("button", { name: "Update due date" }),
    ).not.toBeInTheDocument();
  });

  it("captures ETag from GET single Assignment", async () => {
    const calls = stubFetch((call) => {
      if (
        call.method === "GET" &&
        call.url.endsWith(`/api/v1/teaching/assignments/${ASSIGNMENT_ID}`)
      ) {
        return mockJsonResponse(sampleAssignment(), { etag: '"r0"' });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });
    renderApp(`/teacher-os/teach/assignments/${ASSIGNMENT_ID}`);
    await screen.findByText("ACTIVE");
    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.method === "GET" &&
            call.url.endsWith(
              `/api/v1/teaching/assignments/${ASSIGNMENT_ID}`,
            ),
        ),
      ).toBe(true);
    });
  });
});
