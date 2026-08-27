import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  missionWithReview,
  mockJsonResponse,
  renderApp,
  sampleWork,
  stubFetch,
  WORK_ID,
} from "@/test/test-utils";

describe("J. Accessibility of the Mission, Intent, and Work surfaces", () => {
  it("Mission has one h1, an h2 hero, and a polite status region", async () => {
    stubFetch(() => mockJsonResponse(missionWithReview(2)));
    renderApp("/teacher-os/today");

    await screen.findByRole("heading", { level: 2, name: /waiting for review/i });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it("Prepare labels every field and marks the current step", async () => {
    stubFetch(() => mockJsonResponse(sampleWork, { etag: '"r1"' }));
    renderApp("/teacher-os/prepare");
    const user = userEvent.setup();

    const steps = screen.getByRole("list", { name: /Preparation steps/i });
    const stepItems = within(steps).getAllByRole("listitem");
    expect(stepItems[0]).toHaveTextContent("Outcome");
    expect(stepItems[0]).toHaveAttribute("aria-current", "step");

    const goal = screen.getByLabelText(/Outcome for this lesson/i);
    expect(goal).toHaveAttribute("aria-describedby", "prepare-goal-hint");
    await user.type(goal, "Explain why leaves look green");
    await user.click(
      screen.getByRole("button", { name: /Continue to context/i }),
    );

    for (const label of [
      /^Class \(optional\)/i,
      /^Subject \(optional\)/i,
      /^Topic \(optional\)/i,
      /Lesson date/i,
      /^Locale/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const afterItems = within(steps).getAllByRole("listitem");
    expect(afterItems[1]).toHaveTextContent("Context");
    expect(afterItems[1]).toHaveAttribute("aria-current", "step");
  });

  it("Prepare moves focus to the new step heading and marks the invalid field", async () => {
    stubFetch(() => mockJsonResponse(sampleWork, { etag: '"r1"' }));
    renderApp("/teacher-os/prepare");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Continue to context/i }),
    );
    expect(screen.getByLabelText(/Outcome for this lesson/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await user.type(
      screen.getByLabelText(/Outcome for this lesson/i),
      "Explain why leaves look green",
    );
    await user.click(
      screen.getByRole("button", { name: /Continue to context/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: /Where and when/i }),
      ).toHaveFocus();
    });
  });

  it("Prepare is completable with the keyboard alone", async () => {
    const calls = stubFetch((call) =>
      call.method === "POST"
        ? mockJsonResponse(sampleWork, { status: 201, etag: '"r1"' })
        : mockJsonResponse(sampleWork, { etag: '"r1"' }),
    );
    renderApp("/teacher-os/prepare");
    const user = userEvent.setup();

    const goal = screen.getByLabelText(/Outcome for this lesson/i);
    for (let i = 0; i < 40 && document.activeElement !== goal; i += 1) {
      await user.tab();
    }
    expect(goal).toHaveFocus();

    await user.keyboard("Explain why leaves look green");
    await user.tab();
    await user.keyboard("{Enter}");

    await screen.findByRole("heading", { level: 2, name: /Where and when/i });
    await user.click(screen.getByRole("button", { name: /Review and confirm/i }));
    await user.click(
      screen.getByRole("button", { name: /Create preparation/i }),
    );

    await waitFor(() => {
      expect(calls.some((call) => call.method === "POST")).toBe(true);
    });
  });

  it("Work announces save results in a live region", async () => {
    stubFetch((call) =>
      call.method === "PATCH"
        ? mockJsonResponse(
            { ...sampleWork, topic: "Leaf pigments", aggregate_revision: 2 },
            { etag: '"r2"' },
          )
        : mockJsonResponse(sampleWork, { etag: '"r1"' }),
    );
    renderApp(`/teacher-os/work/${WORK_ID}`);
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 2, name: /Refine this/i });
    const live = document.querySelector('[aria-live="assertive"]');
    expect(live).not.toBeNull();

    await user.clear(screen.getByLabelText(/^Topic$/i));
    await user.type(screen.getByLabelText(/^Topic$/i), "Leaf pigments");
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => {
      expect(live?.textContent ?? "").toMatch(/Saved\./i);
    });
  });

  it("Work exposes its fields as a definition list under headings", async () => {
    stubFetch(() => mockJsonResponse(sampleWork, { etag: '"r1"' }));
    renderApp(`/teacher-os/work/${WORK_ID}`);

    await screen.findByRole("heading", { level: 2, name: /Saved preparation/i });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const name of [
      /Saved preparation/i,
      /Refine this preparation/i,
      /What happens next/i,
    ]) {
      expect(
        screen.getByRole("heading", { level: 2, name }),
      ).toBeInTheDocument();
    }
  });
});
