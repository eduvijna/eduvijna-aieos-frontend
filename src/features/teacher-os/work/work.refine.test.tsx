import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  calendarDate,
  emptyWorkArtifacts,
  isWorkArtifactsPath,
  isWorkGetPath,
  mockJsonResponse,
  renderApp,
  sampleWork,
  stubFetch,
  WORK_ID,
  type FetchCall,
} from "@/test/test-utils";
import type { TeachingWork } from "@/services/api/generated/teachingTypes";

const WORK_PATH = `/api/v1/teaching/works/${WORK_ID}`;
const WORK_ROUTE = `/teacher-os/work/${WORK_ID}`;

function stubWork(
  onPatch?: (call: FetchCall) => Response,
  initial: TeachingWork = sampleWork,
) {
  let current = initial;
  return stubFetch((call) => {
    if (isWorkArtifactsPath(call.url)) {
      return mockJsonResponse(emptyWorkArtifacts());
    }
    if (call.method === "PATCH") {
      if (onPatch) return onPatch(call);
      const patched = { ...current, ...(call.body as Partial<TeachingWork>) };
      current = { ...patched, aggregate_revision: current.aggregate_revision + 1 };
      return mockJsonResponse(current, {
        etag: `"r${current.aggregate_revision}"`,
      });
    }
    if (isWorkGetPath(call.url)) {
      return mockJsonResponse(current, {
        etag: `"r${current.aggregate_revision}"`,
      });
    }
    return mockJsonResponse({ title: "Not Found", status: 404 }, { status: 404 });
  });
}

describe("F. Work detail reads from the server", () => {
  it("shows the saved preparation fields", async () => {
    stubWork();
    renderApp(WORK_ROUTE);

    expect(
      await screen.findByRole("heading", { level: 2, name: /Saved preparation/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Grade 5B")).toBeInTheDocument();
    expect(screen.getByText("Science")).toBeInTheDocument();
    expect(screen.getByText("Photosynthesis")).toBeInTheDocument();
    expect(screen.getByText(calendarDate(1))).toBeInTheDocument();
    expect(screen.getByText("en-IN")).toBeInTheDocument();
    expect(screen.getByText(sampleWork.created_at)).toBeInTheDocument();
    expect(screen.getByText(sampleWork.updated_at)).toBeInTheDocument();
  });

  it("offers Generate preparation draft when no artifact exists", async () => {
    stubWork();
    renderApp(WORK_ROUTE);

    expect(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/DEV03 creates the first worksheet draft/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Worksheet Generator/i)).toBeNull();
    for (const label of [
      /Generate Worksheet/i,
      /Generate Quiz/i,
      /Generate Lesson Plan/i,
    ]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("shows an honest unavailable state without a session", async () => {
    renderApp(WORK_ROUTE, null);
    expect(await screen.findByText(/Session required/i)).toBeInTheDocument();
  });

  it("reports a failed read instead of inventing a preparation", async () => {
    stubFetch(() =>
      mockJsonResponse({ title: "Not Found", status: 404 }, { status: 404 }),
    );
    renderApp(WORK_ROUTE);
    expect(
      await screen.findByText(/Could not load preparation/i),
    ).toBeInTheDocument();
  });
});

describe("G. Work refinement uses If-Match and Idempotency-Key", () => {
  it("PATCHes only the changed fields and shows the server's values", async () => {
    const calls = stubWork(() =>
      mockJsonResponse(
        {
          ...sampleWork,
          topic: "Photosynthesis basics",
          aggregate_revision: 2,
          updated_at: "2026-08-27T06:00:00Z",
        },
        { etag: '"r2"' },
      ),
    );
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    const topic = screen.getByLabelText(/^Topic$/i);
    await user.clear(topic);
    await user.type(topic, "Photosynthesis in leaves");
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.url).toBe(WORK_PATH);
    expect(patch?.headers.get("If-Match")).toBe('"r1"');
    expect(patch?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(patch?.body).toEqual({ topic: "Photosynthesis in leaves" });

    expect(await screen.findByText(/Saved\. This preparation is now at revision 2/i))
      .toBeInTheDocument();
    expect(screen.getByLabelText(/^Topic$/i)).toHaveValue(
      "Photosynthesis basics",
    );
  });

  it("clears an optional field with an explicit null", async () => {
    const calls = stubWork();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    await user.clear(screen.getByLabelText(/^Class$/i));
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.body).toEqual({ class_label: null });
  });

  it("does not send a request when nothing changed", async () => {
    const calls = stubWork();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(await screen.findByText(/Nothing has changed yet/i)).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(0);
  });

  it("refuses to empty the outcome", async () => {
    const calls = stubWork();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    await user.clear(screen.getByLabelText(/^Outcome$/i));
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(
      await screen.findByText(/The outcome cannot be emptied/i),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(0);
  });

  it("on 412 refreshes from the server and reports the stale load", async () => {
    let reads = 0;
    const calls = stubFetch((call) => {
      if (isWorkArtifactsPath(call.url)) {
        return mockJsonResponse(emptyWorkArtifacts());
      }
      if (call.method === "PATCH") {
        return mockJsonResponse(
          { title: "Precondition Failed", status: 412 },
          { status: 412 },
        );
      }
      if (isWorkGetPath(call.url)) {
        reads += 1;
        return reads === 1
          ? mockJsonResponse(sampleWork, { etag: '"r1"' })
          : mockJsonResponse(
              {
                ...sampleWork,
                topic: "Chlorophyll",
                aggregate_revision: 7,
                updated_at: "2026-08-27T07:00:00Z",
              },
              { etag: '"r7"' },
            );
      }
      return mockJsonResponse({ title: "Not Found", status: 404 }, { status: 404 });
    });

    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    await user.clear(screen.getByLabelText(/^Topic$/i));
    await user.type(screen.getByLabelText(/^Topic$/i), "Stale edit");
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(
      await screen.findByText(/changed elsewhere since you loaded it/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/^Topic$/i)).toHaveValue("Chlorophyll");
    });
    expect(
      calls.filter((call) => call.method === "GET" && isWorkGetPath(call.url)),
    ).toHaveLength(2);
  });

  it("reports a missing precondition (428) plainly", async () => {
    stubWork(() =>
      mockJsonResponse(
        { title: "Precondition Required", status: 428 },
        { status: 428 },
      ),
    );
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    await user.clear(screen.getByLabelText(/^Subject$/i));
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(
      await screen.findByText(/required precondition header was missing/i),
    ).toBeInTheDocument();
  });

  it("reports 401 and 403 as a session or access failure", async () => {
    stubWork(() =>
      mockJsonResponse({ title: "Unauthorized", status: 401 }, { status: 401 }),
    );
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    await user.clear(screen.getByLabelText(/^Subject$/i));
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(
      await screen.findByText(/Session or access failure/i),
    ).toBeInTheDocument();
  });
});

describe("H. Work has no browser-side authority", () => {
  it("never writes the preparation to localStorage or sessionStorage", async () => {
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = vi.spyOn(window.sessionStorage, "setItem");
    stubWork();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    await user.clear(screen.getByLabelText(/^Topic$/i));
    await user.type(screen.getByLabelText(/^Topic$/i), "Leaf pigments");
    await user.click(screen.getByRole("button", { name: /Save changes/i }));
    await screen.findByText(/revision 2/i);

    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });

  it("re-reads from the server on reload rather than a cached copy", async () => {
    const calls = stubWork();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    await user.click(screen.getByRole("button", { name: /Reload from server/i }));

    await waitFor(() => {
      expect(
        calls.filter((call) => call.method === "GET" && isWorkGetPath(call.url)),
      ).toHaveLength(2);
    });
  });
});
