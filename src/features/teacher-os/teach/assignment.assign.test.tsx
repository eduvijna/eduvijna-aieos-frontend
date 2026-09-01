import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  CONTENT_ID,
  isContentGetPath,
  isContentVersionGetPath,
  mockJsonResponse,
  mockProblemResponse,
  renderApp,
  sampleContentResponse,
  sampleContentVersionResponse,
  stubFetch,
  VERSION_ID,
  WORK_ID,
} from "@/test/test-utils";

const VIEW_ROUTE = `/teacher-os/work/${WORK_ID}/artifacts/${CONTENT_ID}/versions/${VERSION_ID}`;
const ASSIGNMENT_ID = "aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa";

function publishedContent(contentType: string) {
  return sampleContentResponse({
    content_type: contentType,
    stewardship_state: "APPROVED",
    published_version_id: VERSION_ID,
    current_version_id: VERSION_ID,
  });
}

function stubArtifact(
  contentType: string,
  overrides?: {
    publishedVersionId?: string | null;
    stewardship?: string;
  },
) {
  return stubFetch((call) => {
    if (isContentGetPath(call.url, CONTENT_ID)) {
      return mockJsonResponse(
        sampleContentResponse({
          content_type: contentType,
          stewardship_state: overrides?.stewardship ?? "APPROVED",
          published_version_id:
            overrides?.publishedVersionId === undefined
              ? VERSION_ID
              : overrides.publishedVersionId,
          current_version_id: VERSION_ID,
        }),
        { etag: '"r3"' },
      );
    }
    if (isContentVersionGetPath(call.url, CONTENT_ID, VERSION_ID)) {
      return mockJsonResponse(sampleContentVersionResponse());
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
      call.method === "POST" &&
      call.url.endsWith("/api/v1/teaching/assignments")
    ) {
      return mockJsonResponse(
        {
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
          due_at: null,
          closed_at: null,
          cancelled_at: null,
          aggregate_revision: 0,
          created_at: "2026-09-01T10:00:00Z",
          updated_at: "2026-09-01T10:00:00Z",
        },
        { status: 201, etag: '"r0"' },
      );
    }
    return mockJsonResponse(
      { title: "Not Found", status: 404 },
      { status: 404 },
    );
  });
}

describe("TOS-DEV06-I04 Artifact assign eligibility", () => {
  it.each(["worksheet", "quiz", "homework"] as const)(
    "published %s shows Assign to class",
    async (kind) => {
      stubArtifact(kind);
      renderApp(VIEW_ROUTE);
      expect(
        await screen.findByRole("button", { name: "Assign to class" }),
      ).toBeInTheDocument();
    },
  );

  it("approved unpublished learner artifact hides Assign", async () => {
    stubArtifact("worksheet", { publishedVersionId: null });
    renderApp(VIEW_ROUTE);
    expect(
      await screen.findByRole("button", { name: "Publish" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Assign to class" }),
    ).not.toBeInTheDocument();
  });

  it("viewed version != published_version_id hides Assign", async () => {
    stubArtifact("worksheet", {
      publishedVersionId: "99999999-9999-9999-9999-999999999999",
    });
    renderApp(VIEW_ROUTE);
    await screen.findByRole("heading", {
      name: sampleContentResponse().title,
    });
    expect(
      screen.queryByRole("button", { name: "Assign to class" }),
    ).not.toBeInTheDocument();
  });

  it.each(["lesson_plan", "answer_key", "teacher_notes", "unknown.kind"] as const)(
    "%s hides Assign even when published",
    async (kind) => {
      stubArtifact(kind);
      renderApp(VIEW_ROUTE);
      await screen.findByRole("heading", {
        name: sampleContentResponse().title,
      });
      expect(
        screen.queryByRole("button", { name: "Assign to class" }),
      ).not.toBeInTheDocument();
    },
  );
});

describe("TOS-DEV06-I04 Assign CREATE UX", () => {
  it("submits class_ref only and exact content binding with source_work_id", async () => {
    const user = userEvent.setup();
    const calls = stubArtifact("worksheet");
    renderApp(VIEW_ROUTE);

    await user.click(
      await screen.findByRole("button", { name: "Assign to class" }),
    );
    expect(await screen.findByText("Grade 5A")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/^Class$/i), "class-5a");
    await user.click(
      screen.getByRole("button", { name: "Create assignment" }),
    );

    await screen.findByRole("heading", { name: "Assignment created" });
    const createCall = calls.find(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/assignments"),
    );
    expect(createCall).toBeTruthy();
    expect(createCall?.headers.get("Idempotency-Key")).toBeTruthy();
    const body = createCall?.body as Record<string, unknown>;
    expect(body).toEqual({
      content_id: CONTENT_ID,
      content_version_id: VERSION_ID,
      class_ref: "class-5a",
      source_work_id: WORK_ID,
    });
    expect(body).not.toHaveProperty("tenant_id");
    expect(body).not.toHaveProperty("principal_id");
    expect(body).not.toHaveProperty("effective_actor_id");
    expect(body).not.toHaveProperty("teacher_principal_id");
    expect(body).not.toHaveProperty("assignment_id");
    expect(body).not.toHaveProperty("audience_display_label");
    expect(body).not.toHaveProperty("lifecycle_state");
    expect(body).not.toHaveProperty("aggregate_revision");
    expect(
      screen.getByRole("link", { name: "View in Teach" }),
    ).toHaveAttribute(
      "href",
      `/teacher-os/teach/assignments/${ASSIGNMENT_ID}`,
    );
  });

  it("double submit causes one network CREATE", async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: Response) => void) | null = null;
    const calls = stubFetch((call) => {
      if (isContentGetPath(call.url, CONTENT_ID)) {
        return mockJsonResponse(publishedContent("worksheet"), {
          etag: '"r3"',
        });
      }
      if (isContentVersionGetPath(call.url, CONTENT_ID, VERSION_ID)) {
        return mockJsonResponse(sampleContentVersionResponse());
      }
      if (call.url.includes("/teacher-os/school-context/classes")) {
        return mockJsonResponse({
          items: [{ class_ref: "class-5a", display_label: "Grade 5A" }],
        });
      }
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/assignments")
      ) {
        return new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        });
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(VIEW_ROUTE);
    await user.click(
      await screen.findByRole("button", { name: "Assign to class" }),
    );
    await user.selectOptions(screen.getByLabelText(/^Class$/i), "class-5a");
    const submit = screen.getByRole("button", { name: "Create assignment" });
    await user.click(submit);
    await user.click(submit);

    await waitFor(() => expect(resolveCreate).toBeTruthy());
    resolveCreate!(
      mockJsonResponse(
        {
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
          due_at: null,
          closed_at: null,
          cancelled_at: null,
          aggregate_revision: 0,
          created_at: "2026-09-01T10:00:00Z",
          updated_at: "2026-09-01T10:00:00Z",
        },
        { status: 201, etag: '"r0"' },
      ),
    );

    await screen.findByRole("heading", { name: "Assignment created" });
    expect(
      calls.filter(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith("/api/v1/teaching/assignments"),
      ),
    ).toHaveLength(1);
  });

  it("School Context unavailable shows retryable error", async () => {
    const user = userEvent.setup();
    stubFetch((call) => {
      if (isContentGetPath(call.url, CONTENT_ID)) {
        return mockJsonResponse(publishedContent("worksheet"), {
          etag: '"r3"',
        });
      }
      if (isContentVersionGetPath(call.url, CONTENT_ID, VERSION_ID)) {
        return mockJsonResponse(sampleContentVersionResponse());
      }
      if (call.url.includes("/teacher-os/school-context/classes")) {
        return mockProblemResponse(503, "school_context_unavailable");
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(VIEW_ROUTE);
    await user.click(
      await screen.findByRole("button", { name: "Assign to class" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "School Context unavailable",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("class authority rejection reloads class choices", async () => {
    const user = userEvent.setup();
    let createAttempts = 0;
    stubFetch((call) => {
      if (isContentGetPath(call.url, CONTENT_ID)) {
        return mockJsonResponse(publishedContent("worksheet"), {
          etag: '"r3"',
        });
      }
      if (isContentVersionGetPath(call.url, CONTENT_ID, VERSION_ID)) {
        return mockJsonResponse(sampleContentVersionResponse());
      }
      if (call.url.includes("/teacher-os/school-context/classes")) {
        return mockJsonResponse({
          items:
            createAttempts === 0
              ? [
                  { class_ref: "class-5a", display_label: "Grade 5A" },
                  { class_ref: "class-5b", display_label: "Grade 5B" },
                ]
              : [{ class_ref: "class-5b", display_label: "Grade 5B" }],
        });
      }
      if (
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/assignments")
      ) {
        createAttempts += 1;
        return mockProblemResponse(403, "class_ref_not_assignable");
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(VIEW_ROUTE);
    await user.click(
      await screen.findByRole("button", { name: "Assign to class" }),
    );
    await user.selectOptions(screen.getByLabelText(/^Class$/i), "class-5a");
    await user.click(
      screen.getByRole("button", { name: "Create assignment" }),
    );
    expect(
      await screen.findByText(/no longer assignable/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Grade 5A")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Grade 5B")).toBeInTheDocument();
  });

  it("changed material uses a new idempotency key", async () => {
    const user = userEvent.setup();
    let failOnce = true;
    const calls = stubFetch((call) => {
      if (isContentGetPath(call.url, CONTENT_ID)) {
        return mockJsonResponse(publishedContent("worksheet"), {
          etag: '"r3"',
        });
      }
      if (isContentVersionGetPath(call.url, CONTENT_ID, VERSION_ID)) {
        return mockJsonResponse(sampleContentVersionResponse());
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
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/assignments")
      ) {
        if (failOnce) {
          failOnce = false;
          return mockProblemResponse(503, "school_context_unavailable");
        }
        return mockJsonResponse(
          {
            assignment_id: ASSIGNMENT_ID,
            teacher_principal_id: "bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb",
            content_id: CONTENT_ID,
            content_version_id: VERSION_ID,
            audience_type: "class",
            class_ref: "class-5b",
            audience_display_label: "Grade 5B",
            source_work_id: WORK_ID,
            lifecycle_state: "ACTIVE",
            assigned_at: "2026-09-01T10:00:00Z",
            available_from: "2026-09-01T10:00:00Z",
            due_at: null,
            closed_at: null,
            cancelled_at: null,
            aggregate_revision: 0,
            created_at: "2026-09-01T10:00:00Z",
            updated_at: "2026-09-01T10:00:00Z",
          },
          { status: 201, etag: '"r0"' },
        );
      }
      return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
    });

    renderApp(VIEW_ROUTE);
    await user.click(
      await screen.findByRole("button", { name: "Assign to class" }),
    );
    await user.selectOptions(screen.getByLabelText(/^Class$/i), "class-5a");
    await user.click(
      screen.getByRole("button", { name: "Create assignment" }),
    );
    expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Class$/i), "class-5b");
    await user.click(
      screen.getByRole("button", { name: "Create assignment" }),
    );
    await screen.findByRole("heading", { name: "Assignment created" });

    const createCalls = calls.filter(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/api/v1/teaching/assignments"),
    );
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0]?.headers.get("Idempotency-Key")).not.toEqual(
      createCalls[1]?.headers.get("Idempotency-Key"),
    );
  });
});
