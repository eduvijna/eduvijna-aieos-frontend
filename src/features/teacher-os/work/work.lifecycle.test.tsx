import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_ID,
  isContentGetPath,
  isContentPublishPath,
  isWorkArtifactsPath,
  isWorkGetPath,
  mockJsonResponse,
  mockProblemResponse,
  renderApp,
  sampleContentResponse,
  sampleDetail,
  samplePreparationKitArtifacts,
  samplePublicationResponse,
  sampleWork,
  sampleWorkArtifact,
  stubFetch,
  VERSION_ID,
  WORK_ID,
  workArtifactsWith,
  type FetchCall,
} from "@/test/test-utils";
import type { WorkArtifactItem } from "@/services/api/generated/teachingTypes";
import type { ContentResponse } from "@/services/api/generated/contentTypes";

const WORK_ROUTE = `/teacher-os/work/${WORK_ID}`;

function withStates(
  states: Partial<Record<string, string>>,
): ReturnType<typeof samplePreparationKitArtifacts> {
  const base = samplePreparationKitArtifacts();
  return {
    ...base,
    items: base.items.map((item) => ({
      ...item,
      stewardship_state:
        states[item.artifact_kind ?? ""] ?? item.stewardship_state,
    })),
  };
}

function stubLifecycleSurface(options?: {
  artifacts?:
    | ReturnType<typeof workArtifactsWith>
    | ReturnType<typeof samplePreparationKitArtifacts>;
  contentById?: Record<string, ContentResponse>;
  onPublish?: (call: FetchCall) => Response | Promise<Response>;
  onContentGet?: (call: FetchCall, contentId: string) => Response | Promise<Response>;
}) {
  let artifacts =
    options?.artifacts ??
    withStates({
      worksheet: "APPROVED",
      lesson_plan: "IN_REVIEW",
      quiz: "IN_REVIEW",
      homework: "IN_REVIEW",
      answer_key: "IN_REVIEW",
      teacher_notes: "IN_REVIEW",
    });

  return stubFetch((call) => {
    if (isWorkArtifactsPath(call.url)) {
      return mockJsonResponse(artifacts);
    }
    if (isWorkGetPath(call.url)) {
      return mockJsonResponse(sampleWork, { etag: '"r1"' });
    }
    if (
      call.url.includes(`/review-queue/`) &&
      call.url.includes(`/versions/`)
    ) {
      return mockJsonResponse(sampleDetail, { etag: '"r2"' });
    }

    const publishMatch = call.url.match(
      /\/api\/v1\/contents\/([^/]+)\/actions\/publish/,
    );
    if (publishMatch && call.method === "POST") {
      if (options?.onPublish) return options.onPublish(call);
      const contentId = publishMatch[1];
      artifacts = {
        ...artifacts,
        items: artifacts.items.map((item) =>
          item.content_id === contentId
            ? { ...item, stewardship_state: "PUBLISHED" }
            : item,
        ),
      };
      return mockJsonResponse(
        samplePublicationResponse({
          content_id: contentId,
          version_id:
            artifacts.items.find((item) => item.content_id === contentId)
              ?.version_id ?? VERSION_ID,
          published_version_id:
            artifacts.items.find((item) => item.content_id === contentId)
              ?.version_id ?? VERSION_ID,
        }),
      );
    }

    const contentMatch = call.url.match(/^\/api\/v1\/contents\/([^/?]+)$/);
    if (contentMatch && call.method === "GET") {
      const contentId = contentMatch[1];
      if (options?.onContentGet) {
        return options.onContentGet(call, contentId);
      }
      const item = artifacts.items.find((row) => row.content_id === contentId);
      const override = options?.contentById?.[contentId];
      return mockJsonResponse(
        override ??
          sampleContentResponse({
            content_id: contentId,
            current_version_id: item?.version_id ?? VERSION_ID,
            stewardship_state: item?.stewardship_state ?? "APPROVED",
            title: item?.title ?? "Artifact",
            content_type: item?.content_type ?? "worksheet",
            published_version_id:
              item?.stewardship_state === "PUBLISHED"
                ? (item.version_id ?? null)
                : null,
            aggregate_revision: 3,
          }),
        { etag: '"r3"' },
      );
    }

    return mockJsonResponse(
      { title: "Not Found", status: 404 },
      { status: 404 },
    );
  });
}

describe("TOS-DEV05 Work lifecycle UX", () => {
  it("1. IN_REVIEW shows Review and no Publish", async () => {
    stubLifecycleSurface({
      artifacts: withStates({ worksheet: "IN_REVIEW" }),
    });
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article");
    expect(article).not.toBeNull();
    expect(
      article!.querySelector('a[href*="/teacher-os/review/"]'),
    ).not.toBeNull();
    expect(
      article!.textContent,
    ).toMatch(/In Review/);
    expect(
      Array.from(article!.querySelectorAll("button")).some(
        (btn) => btn.textContent === "Publish",
      ),
    ).toBe(false);
  });

  it("2. APPROVED shows View + Publish", async () => {
    stubLifecycleSurface();
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    expect(article.textContent).toMatch(/Approved/);
    expect(
      article.querySelector('a[href*="/artifacts/"]'),
    ).not.toBeNull();
    expect(
      Array.from(article.querySelectorAll("button")).some(
        (btn) => btn.textContent === "Publish",
      ),
    ).toBe(true);
  });

  it("3. PUBLISHED shows View and no enabled Publish", async () => {
    stubLifecycleSurface({
      artifacts: withStates({ worksheet: "PUBLISHED" }),
    });
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    expect(article.textContent).toMatch(/Published/);
    expect(
      article.querySelector('a[href*="/artifacts/"]'),
    ).not.toBeNull();
    expect(
      Array.from(article.querySelectorAll("button")).some(
        (btn) => btn.textContent === "Publish",
      ),
    ).toBe(false);
  });

  it("4. Unknown stewardship fails closed (no Publish)", async () => {
    stubLifecycleSurface({
      artifacts: withStates({ worksheet: "WEIRD_FUTURE_STATE" }),
    });
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    expect(article.textContent).toMatch(/WEIRD_FUTURE_STATE/);
    expect(
      Array.from(article.querySelectorAll("button")).some(
        (btn) => btn.textContent === "Publish",
      ),
    ).toBe(false);
  });

  it("5–9. Publish GETs Content first with checks, body, If-Match, Idempotency-Key", async () => {
    const calls = stubLifecycleSurface();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    const worksheet = samplePreparationKitArtifacts().items.find(
      (item) => item.artifact_kind === "worksheet",
    )!;

    await user.click(
      Array.from(article.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Publish",
      )!,
    );

    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.method === "GET" &&
            isContentGetPath(call.url, worksheet.content_id),
        ),
      ).toBe(true);
      expect(
        calls.some(
          (call) =>
            call.method === "POST" &&
            isContentPublishPath(call.url, worksheet.content_id),
        ),
      ).toBe(true);
    });

    const getIndex = calls.findIndex(
      (call) =>
        call.method === "GET" &&
        isContentGetPath(call.url, worksheet.content_id),
    );
    const postIndex = calls.findIndex(
      (call) =>
        call.method === "POST" &&
        isContentPublishPath(call.url, worksheet.content_id),
    );
    expect(getIndex).toBeGreaterThanOrEqual(0);
    expect(postIndex).toBeGreaterThan(getIndex);

    const post = calls[postIndex];
    expect(post.body).toEqual({ version_id: worksheet.version_id });
    expect(post.headers.get("If-Match")).toBe('"r3"');
    expect(post.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("10. Double-click does not issue duplicate publish POSTs", async () => {
    let publishPosts = 0;
    const calls = stubLifecycleSurface({
      onPublish: async () => {
        publishPosts += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return mockJsonResponse(samplePublicationResponse());
      },
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    const publishBtn = Array.from(article.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Publish",
    )!;

    await Promise.all([user.click(publishBtn), user.click(publishBtn)]);

    await waitFor(() => {
      expect(
        calls.some((call) => call.method === "POST" && call.url.includes("/publish")),
      ).toBe(true);
    });
    expect(publishPosts).toBe(1);
  });

  it("11. 412 refreshes state and does not blind-retry", async () => {
    let publishAttempts = 0;
    const calls = stubLifecycleSurface({
      onPublish: () => {
        publishAttempts += 1;
        return mockProblemResponse(412, "precondition_failed", "Stale ETag");
      },
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await user.click(
      Array.from(article.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Publish",
      )!,
    );

    await waitFor(() => {
      expect(publishAttempts).toBe(1);
    });
    expect(
      await screen.findByText(/changed since you loaded it/i),
    ).toBeInTheDocument();
    expect(
      calls.filter(
        (call) => call.method === "POST" && call.url.includes("/publish"),
      ),
    ).toHaveLength(1);
  });

  it("12. Current version drift prevents POST", async () => {
    const worksheet = samplePreparationKitArtifacts().items.find(
      (item) => item.artifact_kind === "worksheet",
    )!;
    const calls = stubLifecycleSurface({
      onContentGet: () =>
        mockJsonResponse(
          sampleContentResponse({
            content_id: worksheet.content_id,
            current_version_id: "99999999-9999-9999-9999-999999999999",
            stewardship_state: "APPROVED",
          }),
          { etag: '"r3"' },
        ),
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await user.click(
      Array.from(article.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Publish",
      )!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/current version no longer matches/i),
      ).toBeInTheDocument();
    });
    expect(
      calls.some(
        (call) => call.method === "POST" && call.url.includes("/publish"),
      ),
    ).toBe(false);
  });

  it("13. Already-published exact version does not POST again", async () => {
    const worksheet = samplePreparationKitArtifacts().items.find(
      (item) => item.artifact_kind === "worksheet",
    )!;
    const calls = stubLifecycleSurface({
      onContentGet: () =>
        mockJsonResponse(
          sampleContentResponse({
            content_id: worksheet.content_id,
            current_version_id: worksheet.version_id,
            published_version_id: worksheet.version_id,
            stewardship_state: "APPROVED",
          }),
          { etag: '"r3"' },
        ),
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await user.click(
      Array.from(article.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Publish",
      )!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/already published/i),
      ).toBeInTheDocument();
    });
    expect(
      calls.some(
        (call) => call.method === "POST" && call.url.includes("/publish"),
      ),
    ).toBe(false);
  });

  it("14–15. Successful publish reloads Work; only that artifact becomes Published", async () => {
    stubLifecycleSurface();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    expect(
      await screen.findByTestId("work-lifecycle-summary"),
    ).toHaveTextContent(/6 artifacts · 5 in review · 1 approved/);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await user.click(
      Array.from(article.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Publish",
      )!,
    );

    await waitFor(() => {
      expect(article.getAttribute("data-stewardship")).toBe("PUBLISHED");
    });
    expect(article.textContent).toMatch(/Published/);

    for (const label of [
      "Lesson Plan",
      "Quick Quiz",
      "Homework",
      "Answer Key",
      "Teacher Notes",
    ]) {
      const other = screen.getByRole("heading", { name: label }).closest(
        "article",
      )!;
      expect(other.getAttribute("data-stewardship")).toBe("IN_REVIEW");
      expect(other.textContent).not.toMatch(/\bPublished\b/);
    }
  });

  it("19. Historical DEV03 single worksheet remains safe", async () => {
    const approved: WorkArtifactItem = {
      ...sampleWorkArtifact,
      stewardship_state: "APPROVED",
    };
    stubLifecycleSurface({
      artifacts: workArtifactsWith(approved),
    });
    renderApp(WORK_ROUTE);

    expect(
      await screen.findByRole("heading", { name: /Worksheet draft/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Preparation kit" })).toBeNull();
  });

  it("20. No browser storage contains publication authority or secrets", async () => {
    localStorage.clear();
    sessionStorage.clear();
    stubLifecycleSurface();
    renderApp(WORK_ROUTE);
    await screen.findByRole("heading", { name: "Worksheet" });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toMatch(/publish|etag|token|secret/i);
  });
});

describe("TOS-DEV05 Review return continuity", () => {
  it("16. Approve entered from Work returns to originating Work", async () => {
    stubFetch((call) => {
      if (call.url.includes("/actions/approve")) {
        return mockJsonResponse({
          review_decision_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          content_id: CONTENT_ID,
          version_id: VERSION_ID,
          decision: "APPROVED",
          reason_code: null,
          comment: null,
          decided_at: "2026-08-20T12:00:00Z",
          stewardship_state: "APPROVED",
          aggregate_revision: 3,
        });
      }
      if (isWorkGetPath(call.url) || isWorkArtifactsPath(call.url)) {
        return mockJsonResponse(
          isWorkArtifactsPath(call.url)
            ? workArtifactsWith({
                ...sampleWorkArtifact,
                stewardship_state: "APPROVED",
              })
            : sampleWork,
          { etag: '"r1"' },
        );
      }
      if (call.url.includes("/versions/")) {
        return mockJsonResponse(sampleDetail, { etag: '"r2"' });
      }
      return mockJsonResponse({ items: [], next_cursor: null });
    });

    renderApp(
      `/teacher-os/review/${CONTENT_ID}/versions/${VERSION_ID}?fromWork=${WORK_ID}`,
    );
    await screen.findByRole("heading", { name: sampleDetail.title });
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(
      await screen.findByRole("heading", { name: /Saved preparation/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: sampleWork.goal_text }),
    ).toBeInTheDocument();
  });

  it("17. Review entered from Review Queue retains queue-return behavior", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/actions/approve")) {
          return mockJsonResponse({
            review_decision_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
            content_id: CONTENT_ID,
            version_id: VERSION_ID,
            decision: "APPROVED",
            reason_code: null,
            comment: null,
            decided_at: "2026-08-20T12:00:00Z",
            stewardship_state: "APPROVED",
            aggregate_revision: 3,
          });
        }
        if (url.includes("/versions/")) {
          return mockJsonResponse(sampleDetail, { etag: '"r2"' });
        }
        return mockJsonResponse({ items: [], next_cursor: null });
      }),
    );

    renderApp(`/teacher-os/review/${CONTENT_ID}/versions/${VERSION_ID}`);
    await screen.findByRole("heading", { name: sampleDetail.title });
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(
      await screen.findByRole("heading", { name: "Review Queue" }),
    ).toBeInTheDocument();
  });
});
