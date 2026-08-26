import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  renderApp,
  mockJsonResponse,
  sampleQueueItem,
} from "@/test/test-utils";

describe("B. Today Review Queue card states", () => {
  it("shows unavailable without session", async () => {
    renderApp("/teacher-os/today", null);
    expect(await screen.findByText(/Session required/i)).toBeInTheDocument();
  });

  it("shows pending count from first page and CTA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockJsonResponse({
          items: [sampleQueueItem, { ...sampleQueueItem, content_id: "a" }],
          next_cursor: "cursor-1",
        }),
      ),
    );

    renderApp("/teacher-os/today");

    await waitFor(() => {
      expect(screen.getByText(/2\+/)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: /Load review queue/i }),
    ).toBeInTheDocument();
  });

  it("shows empty state when queue has no items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockJsonResponse({ items: [], next_cursor: null }),
      ),
    );
    renderApp("/teacher-os/today");
    expect(await screen.findByText(/No pending reviews/i)).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockJsonResponse(
          { title: "boom", status: 500 },
          { status: 500 },
        ),
      ),
    );
    renderApp("/teacher-os/today");
    expect(
      await screen.findByText(/Could not load review queue/i),
    ).toBeInTheDocument();
  });
});
