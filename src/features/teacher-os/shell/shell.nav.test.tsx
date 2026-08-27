import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderApp, mockJsonResponse, DEV_SESSION } from "@/test/test-utils";

describe("A. Shell nav + Today landing", () => {
  it("renders outcome-first nav and Today landing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockJsonResponse({ items: [], next_cursor: null }),
      ),
    );

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

    await userEvent.click(screen.getByRole("link", { name: "Prepare" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Prepare" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/DEV placeholder/i)).toBeInTheDocument();
  });
});
