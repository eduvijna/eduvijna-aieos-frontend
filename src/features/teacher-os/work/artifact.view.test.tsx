import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CONTENT_ID,
  isContentGetPath,
  isContentVersionGetPath,
  mockJsonResponse,
  renderApp,
  sampleContentResponse,
  sampleContentVersionResponse,
  stubFetch,
  VERSION_ID,
  WORK_ID,
} from "@/test/test-utils";

const VIEW_ROUTE = `/teacher-os/work/${WORK_ID}/artifacts/${CONTENT_ID}/versions/${VERSION_ID}`;

describe("TOS-DEV05R1 Artifact viewer", () => {
  it("18. Uses Generic Content GET + version GET, not Review Queue detail", async () => {
    const calls = stubFetch((call) => {
      if (isContentGetPath(call.url, CONTENT_ID)) {
        return mockJsonResponse(
          sampleContentResponse({
            stewardship_state: "APPROVED",
            published_version_id: null,
          }),
          { etag: '"r3"' },
        );
      }
      if (isContentVersionGetPath(call.url, CONTENT_ID, VERSION_ID)) {
        return mockJsonResponse(sampleContentVersionResponse());
      }
      if (call.url.includes("/teacher-os/review-queue/")) {
        throw new Error("Review Queue detail must not be used for durable view");
      }
      return mockJsonResponse(
        { title: "Not Found", status: 404 },
        { status: 404 },
      );
    });

    renderApp(VIEW_ROUTE);

    expect(
      await screen.findByRole("heading", {
        name: sampleContentResponse().title,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Artifact" }).closest("section"),
    ).toHaveTextContent("Approved");
    expect(screen.getByText("Name one part of a leaf")).toBeInTheDocument();
    expect(
      screen.getByText(/does not use the Review Queue/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();

    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.method === "GET" && isContentGetPath(call.url, CONTENT_ID),
        ),
      ).toBe(true);
      expect(
        calls.some(
          (call) =>
            call.method === "GET" &&
            isContentVersionGetPath(call.url, CONTENT_ID, VERSION_ID),
        ),
      ).toBe(true);
    });
    expect(
      calls.some((call) => call.url.includes("/teacher-os/review-queue/")),
    ).toBe(false);
  });

  it("7. APPROVED + exact published_version_id shows Published and no Publish", async () => {
    stubFetch((call) => {
      if (isContentGetPath(call.url, CONTENT_ID)) {
        return mockJsonResponse(
          sampleContentResponse({
            stewardship_state: "APPROVED",
            published_version_id: VERSION_ID,
            current_version_id: VERSION_ID,
          }),
          { etag: '"r4"' },
        );
      }
      if (isContentVersionGetPath(call.url, CONTENT_ID, VERSION_ID)) {
        return mockJsonResponse(sampleContentVersionResponse());
      }
      return mockJsonResponse(
        { title: "Not Found", status: 404 },
        { status: 404 },
      );
    });

    renderApp(VIEW_ROUTE);
    expect(
      await screen.findByRole("heading", { name: "Artifact" }),
    ).toBeInTheDocument();
    const meta = screen.getByRole("heading", { name: "Artifact" }).closest(
      "section",
    );
    expect(meta).toHaveTextContent("Published");
    expect(meta).toHaveTextContent("APPROVED");
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });
});
