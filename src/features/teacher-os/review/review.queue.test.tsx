import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  renderApp,
  mockJsonResponse,
  sampleQueueItem,
} from "@/test/test-utils";

describe("C. Queue list + cursor pagination + empty", () => {
  it("renders queue fields and load-more pagination", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cursor=")) {
        return mockJsonResponse({
          items: [
            {
              ...sampleQueueItem,
              content_id: "33333333-3333-3333-3333-333333333333",
              title: "Second page item",
            },
          ],
          next_cursor: null,
        });
      }
      return mockJsonResponse({
        items: [sampleQueueItem],
        next_cursor: "next-page",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/teacher-os/review");

    expect(
      await screen.findByRole("heading", { name: "Photosynthesis draft" }),
    ).toBeInTheDocument();
    expect(screen.getByText("lesson.plan")).toBeInTheDocument();
    expect(screen.getByText("In Review")).toBeInTheDocument();
    expect(screen.getByText("teacher")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open artifact/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Load more/i }));
    await waitFor(() => {
      expect(screen.getByText("Second page item")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows empty queue state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockJsonResponse({ items: [], next_cursor: null }),
      ),
    );
    renderApp("/teacher-os/review");
    expect(await screen.findByText(/Queue is empty/i)).toBeInTheDocument();
  });
});
