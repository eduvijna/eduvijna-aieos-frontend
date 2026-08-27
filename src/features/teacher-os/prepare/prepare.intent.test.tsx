import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  calendarDate,
  emptyWorkArtifacts,
  isWorkArtifactsPath,
  mockJsonResponse,
  renderApp,
  sampleWork,
  stubFetch,
  type FetchCall,
} from "@/test/test-utils";

function stubTeachingApis() {
  return stubFetch((call) => {
    if (call.method === "POST" && call.url === "/api/v1/teaching/works") {
      return mockJsonResponse(sampleWork, { status: 201, etag: '"r1"' });
    }
    if (isWorkArtifactsPath(call.url, sampleWork.work_id)) {
      return mockJsonResponse(emptyWorkArtifacts(sampleWork.work_id));
    }
    if (call.url === `/api/v1/teaching/works/${sampleWork.work_id}`) {
      return mockJsonResponse(sampleWork, { etag: '"r1"' });
    }
    return mockJsonResponse({ title: "unexpected", status: 404 }, { status: 404 });
  });
}

async function fillIntent(options?: { skipContext?: boolean }) {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText(/Outcome for this lesson/i),
    "Explain why leaves look green",
  );
  await user.click(screen.getByRole("button", { name: /Continue to context/i }));

  if (!options?.skipContext) {
    await user.type(screen.getByLabelText(/^Class \(optional\)/i), "Grade 5B");
    await user.type(screen.getByLabelText(/^Subject \(optional\)/i), "Science");
    await user.type(screen.getByLabelText(/^Topic \(optional\)/i), "Photosynthesis");
  }
  await user.click(screen.getByRole("button", { name: /Review and confirm/i }));
  return user;
}

describe("D. Prepare is a real Teaching Intent flow", () => {
  it("is no longer a development placeholder", async () => {
    stubTeachingApis();
    renderApp("/teacher-os/prepare");

    expect(
      screen.getByRole("heading", { level: 1, name: /Help me prepare tomorrow/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/DEV placeholder/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not implemented/i)).not.toBeInTheDocument();
  });

  it("asks for the outcome first", async () => {
    stubTeachingApis();
    renderApp("/teacher-os/prepare");

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /What should your students understand or be able to do\?/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Outcome for this lesson/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/^Subject \(optional\)/i),
    ).not.toBeInTheDocument();
  });

  it("refuses to advance without an outcome", async () => {
    stubTeachingApis();
    renderApp("/teacher-os/prepare");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Continue to context/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Describe the outcome/i,
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /What should your students understand/i,
      }),
    ).toBeInTheDocument();
  });

  it("collects context with tomorrow and en-IN as editable defaults", async () => {
    stubTeachingApis();
    renderApp("/teacher-os/prepare");
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText(/Outcome for this lesson/i),
      "Explain why leaves look green",
    );
    await user.click(
      screen.getByRole("button", { name: /Continue to context/i }),
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /Where and when/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Lesson date/i)).toHaveValue(calendarDate(1));
    expect(screen.getByLabelText(/^Locale/i)).toHaveValue("en-IN");

    fireEvent.change(screen.getByLabelText(/Lesson date/i), {
      target: { value: calendarDate(3) },
    });
    expect(screen.getByLabelText(/Lesson date/i)).toHaveValue(calendarDate(3));
  });

  it("confirms the intent before anything is created", async () => {
    stubTeachingApis();
    renderApp("/teacher-os/prepare");
    await fillIntent();

    expect(
      screen.getByRole("heading", { level: 2, name: /Confirm this preparation/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("prepare-summary")).toHaveTextContent(
      `Prepare tomorrow · Grade 5B · Science · Photosynthesis · ${calendarDate(1)}`,
    );
    expect(
      screen.getByText(/Goal: Explain why leaves look green/i),
    ).toBeInTheDocument();
  });

  it("creates the Work with an Idempotency-Key and navigates to it", async () => {
    const calls = stubTeachingApis();
    renderApp("/teacher-os/prepare");
    const user = await fillIntent();

    await user.click(screen.getByRole("button", { name: /Create preparation/i }));

    const post = calls.find(
      (call: FetchCall) =>
        call.method === "POST" && call.url === "/api/v1/teaching/works",
    );
    expect(post).toBeDefined();
    expect(post?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post?.headers.get("Content-Type")).toContain("application/json");
    expect(post?.body).toEqual({
      intent_type: "prepare_tomorrow",
      goal_text: "Explain why leaves look green",
      class_label: "Grade 5B",
      subject: "Science",
      topic: "Photosynthesis",
      target_date: calendarDate(1),
      locale: "en-IN",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: /Saved preparation/i }),
      ).toBeInTheDocument();
    });
  });

  it("sends null for omitted optional context rather than empty strings", async () => {
    const calls = stubTeachingApis();
    renderApp("/teacher-os/prepare");
    const user = await fillIntent({ skipContext: true });

    await user.click(screen.getByRole("button", { name: /Create preparation/i }));

    const post = calls.find((call: FetchCall) => call.method === "POST");
    expect(post?.body).toMatchObject({
      class_label: null,
      subject: null,
      topic: null,
    });
  });

  it("reuses one Idempotency-Key when the same submission is retried", async () => {
    let attempt = 0;
    const calls = stubFetch((call) => {
      if (call.method === "POST") {
        attempt += 1;
        if (attempt === 1) {
          return mockJsonResponse(
            { title: "Service Unavailable", status: 503 },
            { status: 503 },
          );
        }
        return mockJsonResponse(sampleWork, { status: 201, etag: '"r1"' });
      }
      if (isWorkArtifactsPath(call.url, sampleWork.work_id)) {
        return mockJsonResponse(emptyWorkArtifacts(sampleWork.work_id));
      }
      return mockJsonResponse(sampleWork, { etag: '"r1"' });
    });

    renderApp("/teacher-os/prepare");
    const user = await fillIntent();
    const create = screen.getByRole("button", { name: /Create preparation/i });

    await user.click(create);
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    await user.click(create);

    const posts = calls.filter((call: FetchCall) => call.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[0].headers.get("Idempotency-Key")).toBe(
      posts[1].headers.get("Idempotency-Key"),
    );
  });

  it("reports a create failure without pretending it succeeded", async () => {
    stubFetch(() =>
      mockJsonResponse({ title: "Forbidden", status: 403 }, { status: 403 }),
    );
    renderApp("/teacher-os/prepare");
    const user = await fillIntent();

    await user.click(screen.getByRole("button", { name: /Create preparation/i }));

    expect(
      await screen.findByText(/Session or access failure/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Confirm this preparation/i }),
    ).toBeInTheDocument();
  });

  it("needs a session before a preparation can be created", async () => {
    renderApp("/teacher-os/prepare", null);
    expect(await screen.findByText(/Session required/i)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Outcome for this lesson/i),
    ).not.toBeInTheDocument();
  });
});

describe("E. Prepare is not generator-first", () => {
  it("offers no document-type generator grid as the primary choice", async () => {
    stubTeachingApis();
    renderApp("/teacher-os/prepare");

    for (const label of [
      /Generate Worksheet/i,
      /Generate Quiz/i,
      /Generate Lesson Plan/i,
      /Create Worksheet/i,
      /Create Quiz/i,
    ]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
  });
});
