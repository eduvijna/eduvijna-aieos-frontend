import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  renderApp,
  mockJsonResponse,
  sampleDetail,
  sampleQueueItem,
} from "@/test/test-utils";

const detailPath = `/teacher-os/review/${sampleQueueItem.content_id}/versions/${sampleQueueItem.version_id}`;

describe("E–H. Review detail mutations", () => {
  it("E. Approve sends If-Match + Idempotency-Key and refreshes path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/actions/approve")) {
        const headers = new Headers(init?.headers);
        expect(headers.get("If-Match")).toBe('"r2"');
        expect(headers.get("Idempotency-Key")).toMatch(
          /^[0-9a-f-]{36}$/i,
        );
        return mockJsonResponse(
          {
            review_decision_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
            content_id: sampleQueueItem.content_id,
            version_id: sampleQueueItem.version_id,
            decision: "APPROVED",
            reason_code: null,
            comment: null,
            decided_at: "2026-08-20T12:00:00Z",
            stewardship_state: "APPROVED",
            aggregate_revision: 3,
          },
          { etag: '"r3"' },
        );
      }
      if (url.includes("/teacher-os/review-queue/") && !url.endsWith("review-queue")) {
        return mockJsonResponse(sampleDetail, { etag: '"r2"' });
      }
      return mockJsonResponse({ items: [], next_cursor: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp(detailPath);
    expect(
      await screen.findByRole("heading", { name: sampleDetail.title }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/actions/approve"),
        ),
      ).toBe(true);
    });
    expect(
      await screen.findByRole("heading", { name: "Review Queue" }),
    ).toBeInTheDocument();
  });

  it("F. Request changes requires comment feedback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/actions/request-changes")) {
          const body = JSON.parse(String(init?.body));
          expect(body.comment).toBe("Please clarify step 2");
          return mockJsonResponse({
            review_decision_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            content_id: sampleQueueItem.content_id,
            version_id: sampleQueueItem.version_id,
            decision: "CHANGES_REQUESTED",
            reason_code: null,
            comment: body.comment,
            decided_at: "2026-08-20T12:00:00Z",
            stewardship_state: "CHANGES_REQUESTED",
            aggregate_revision: 3,
          });
        }
        if (url.includes("/versions/")) {
          return mockJsonResponse(sampleDetail, { etag: '"r2"' });
        }
        return mockJsonResponse({ items: [], next_cursor: null });
      }),
    );

    renderApp(detailPath);
    await screen.findByRole("heading", { name: sampleDetail.title });
    await userEvent.click(
      screen.getByRole("button", { name: "Request changes" }),
    );
    await userEvent.type(
      screen.getByLabelText(/Comment \(required\)/i),
      "Please clarify step 2",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Submit request changes/i }),
    );
    expect(
      await screen.findByRole("heading", { name: "Review Queue" }),
    ).toBeInTheDocument();
  });

  it("G. Reject requires confirmation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/actions/reject")) {
        return mockJsonResponse({
          review_decision_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          content_id: sampleQueueItem.content_id,
          version_id: sampleQueueItem.version_id,
          decision: "REJECTED",
          reason_code: null,
          comment: null,
          decided_at: "2026-08-20T12:00:00Z",
          stewardship_state: "REJECTED",
          aggregate_revision: 3,
        });
      }
      if (url.includes("/versions/")) {
        return mockJsonResponse(sampleDetail, { etag: '"r2"' });
      }
      return mockJsonResponse({ items: [], next_cursor: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp(detailPath);
    await screen.findByRole("heading", { name: sampleDetail.title });
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));

    const confirmReject = screen.getByRole("button", {
      name: /Confirm reject/i,
    });
    expect(confirmReject).toBeDisabled();

    await userEvent.click(
      screen.getByLabelText(/I confirm I want to reject/i),
    );
    expect(confirmReject).toBeEnabled();
    await userEvent.click(confirmReject);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/actions/reject"),
        ),
      ).toBe(true);
    });
  });

  it("H. 412 stale UI refetches detail", async () => {
    let detailCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/actions/approve")) {
        return mockJsonResponse(
          { title: "Precondition Failed", status: 412 },
          { status: 412 },
        );
      }
      if (url.includes("/teacher-os/review-queue/") && url.includes("/versions/")) {
        detailCalls += 1;
        return mockJsonResponse(
          {
            ...sampleDetail,
            title:
              detailCalls > 1 ? "Photosynthesis draft (refreshed)" : sampleDetail.title,
          },
          { etag: detailCalls > 1 ? '"r4"' : '"r2"' },
        );
      }
      return mockJsonResponse({ items: [], next_cursor: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp(detailPath);
    await screen.findByRole("heading", { name: sampleDetail.title });
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(
      await screen.findByText(/changed since you loaded it/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(detailCalls).toBeGreaterThanOrEqual(2);
    });
    expect(
      await screen.findByRole("heading", {
        name: "Photosynthesis draft (refreshed)",
      }),
    ).toBeInTheDocument();
  });
});
