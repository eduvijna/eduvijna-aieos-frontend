import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  mockJsonResponse,
  renderApp,
  sampleWork,
  stubFetch,
  WORK_ID,
} from "@/test/test-utils";

function stubTeachBoot() {
  stubFetch((call) => {
    if (
      call.method === "GET" &&
      call.url.startsWith("/api/v1/teaching/works")
    ) {
      return mockJsonResponse({ items: [sampleWork], has_more: false });
    }
    if (call.url.includes("/teacher-os/school-context/classes")) {
      return mockJsonResponse({
        items: [{ class_ref: "class-5a", display_label: "Grade 5A" }],
      });
    }
    if (call.url.endsWith("/api/v1/teaching/assignments")) {
      return mockJsonResponse({ items: [], has_more: false });
    }
    if (call.url.includes("/teacher-os/teach/context")) {
      return mockJsonResponse({
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
        artifacts: [],
        assignments: [],
        executions: [],
      });
    }
    return mockJsonResponse({ title: "x", status: 404 }, { status: 404 });
  });
}

describe("TOS-DEV07-I03 Teach a11y", () => {
  it("exposes headings, labelled controls, and a live status region", async () => {
    const user = userEvent.setup();
    stubTeachBoot();
    renderApp("/teacher-os/teach");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Teaching workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Select work and class" }),
    ).toBeInTheDocument();

    const work = screen.getByLabelText("Teaching work");
    const klass = screen.getByLabelText("Class");
    expect(work).toBeEnabled();
    expect(klass).toBeEnabled();

    await user.selectOptions(work, WORK_ID);
    await user.selectOptions(klass, "class-5a");

    expect(
      await screen.findByRole("heading", { name: "Teach context" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Artifacts to bind" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start lesson" }),
    ).toBeInTheDocument();

    const liveRegions = document.querySelectorAll(
      '[aria-live="polite"], [aria-live="assertive"], [role="status"]',
    );
    expect(liveRegions.length).toBeGreaterThan(0);
  });
});
