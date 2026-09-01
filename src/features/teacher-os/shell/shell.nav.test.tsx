import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  DEV_SESSION,
  missionWithPrepareTomorrow,
  mockJsonResponse,
  renderApp,
  stubFetch,
} from "@/test/test-utils";

describe("A. Shell nav + Mission-first landing", () => {
  it("renders outcome-first nav and lands on the Mission, not a card dashboard", async () => {
    stubFetch(() => mockJsonResponse(missionWithPrepareTomorrow()));

    renderApp("/teacher-os/today", DEV_SESSION);

    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    for (const label of [
      "Today",
      "Prepare",
      "Teach",
      "Assess",
      "Improve",
      "Library",
      "AI Assistant",
      "Settings",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }

    expect(
      screen.getByRole("heading", { level: 1, name: /Today's Mission/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: /Nothing is waiting\. Prepare tomorrow's lesson\./i,
      }),
    ).toBeInTheDocument();
  });

  it("navigates to a real Prepare flow instead of a placeholder", async () => {
    stubFetch(() => mockJsonResponse(missionWithPrepareTomorrow()));

    renderApp("/teacher-os/today", DEV_SESSION);
    await userEvent.click(screen.getByRole("link", { name: "Prepare" }));

    expect(
      screen.getByRole("heading", { level: 1, name: /Help me prepare tomorrow/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/DEV placeholder/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not implemented/i)).not.toBeInTheDocument();
  });

  it("navigates to the real Teach Assignments surface instead of a placeholder", async () => {
    stubFetch((call) => {
      if (call.url.includes("/teaching/assignments")) {
        return mockJsonResponse({ items: [], has_more: false });
      }
      return mockJsonResponse(missionWithPrepareTomorrow());
    });

    renderApp("/teacher-os/today", DEV_SESSION);
    await userEvent.click(screen.getByRole("link", { name: "Teach" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Assignments" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/DEV placeholder/i)).not.toBeInTheDocument();
    expect(
      await screen.findByText("No assignments yet"),
    ).toBeInTheDocument();
  });
});
