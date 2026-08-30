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
import type { ContentResponse } from "@/services/api/contentApi";

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
  publishedVersionByContentId?: Record<string, string | null>;
  contentOverrides?: Record<string, Partial<ContentResponse>>;
  onPublish?: (call: FetchCall) => Response | Promise<Response>;
  onContentGet?: (
    call: FetchCall,
    contentId: string,
  ) => Response | Promise<Response>;
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
  const publishedVersionByContentId: Record<string, string | null> = {
    ...(options?.publishedVersionByContentId ?? {}),
  };

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
      const item = artifacts.items.find((row) => row.content_id === contentId);
      // Backend-realistic: stewardship stays APPROVED; publication pointer moves.
      publishedVersionByContentId[contentId] = item?.version_id ?? VERSION_ID;
      artifacts = {
        ...artifacts,
        items: artifacts.items.map((row) =>
          row.content_id === contentId
            ? { ...row, stewardship_state: "APPROVED" }
            : row,
        ),
      };
      return mockJsonResponse(
        samplePublicationResponse({
          content_id: contentId,
          version_id: item?.version_id ?? VERSION_ID,
          published_version_id: item?.version_id ?? VERSION_ID,
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
      const published = publishedVersionByContentId[contentId] ?? null;
      return mockJsonResponse(
        sampleContentResponse({
          content_id: contentId,
          current_version_id: item?.version_id ?? VERSION_ID,
          stewardship_state: item?.stewardship_state ?? "APPROVED",
          title: item?.title ?? "Artifact",
          content_type: item?.content_type ?? "worksheet",
          published_version_id: published,
          aggregate_revision: 3,
          ...options?.contentOverrides?.[contentId],
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

describe("TOS-DEV05R1 Work lifecycle UX", () => {
  it("1. IN_REVIEW shows Review and no Publish", async () => {
    stubLifecycleSurface({
      artifacts: withStates({ worksheet: "IN_REVIEW" }),
    });
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await waitFor(() => {
      expect(article.textContent).toMatch(/In Review/);
    });
    expect(
      article.querySelector('a[href*="/teacher-os/review/"]'),
    ).not.toBeNull();
    expect(
      Array.from(article.querySelectorAll("button")).some(
        (btn) => btn.textContent === "Publish",
      ),
    ).toBe(false);
  });

  it("2. APPROVED shows View + Publish when Content current matches", async () => {
    stubLifecycleSurface();
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await waitFor(() => {
      expect(
        Array.from(article.querySelectorAll("button")).some(
          (btn) => btn.textContent === "Publish",
        ),
      ).toBe(true);
    });
    expect(article.textContent).toMatch(/Approved/);
    expect(article.querySelector('a[href*="/artifacts/"]')).not.toBeNull();
  });

  it("3. Exact published pointer shows Published with View and no Publish", async () => {
    const kit = withStates({ worksheet: "APPROVED" });
    const worksheet = kit.items.find((item) => item.artifact_kind === "worksheet")!;
    stubLifecycleSurface({
      artifacts: kit,
      publishedVersionByContentId: {
        [worksheet.content_id]: worksheet.version_id,
      },
    });
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await waitFor(() => {
      expect(article.getAttribute("data-lifecycle")).toBe("published");
    });
    expect(article.getAttribute("data-stewardship")).toBe("APPROVED");
    expect(article.textContent).toMatch(/Published/);
    expect(article.querySelector('a[href*="/artifacts/"]')).not.toBeNull();
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
    await waitFor(() => {
      expect(article.textContent).toMatch(/WEIRD_FUTURE_STATE/);
    });
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
    const worksheet = samplePreparationKitArtifacts().items.find(
      (item) => item.artifact_kind === "worksheet",
    )!;

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await waitFor(() => {
      expect(
        Array.from(article.querySelectorAll("button")).some(
          (btn) => btn.textContent === "Publish",
        ),
      ).toBe(true);
    });

    await user.click(
      Array.from(article.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Publish",
      )!,
    );

    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.method === "POST" &&
            isContentPublishPath(call.url, worksheet.content_id),
        ),
      ).toBe(true);
    });

    const getCalls = calls.filter(
      (call) =>
        call.method === "GET" &&
        isContentGetPath(call.url, worksheet.content_id),
    );
    expect(getCalls.length).toBeGreaterThanOrEqual(1);

    const post = calls.find(
      (call) =>
        call.method === "POST" &&
        isContentPublishPath(call.url, worksheet.content_id),
    )!;
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
    await waitFor(() => {
      expect(
        Array.from(article.querySelectorAll("button")).some(
          (btn) => btn.textContent === "Publish",
        ),
      ).toBe(true);
    });
    const publishBtn = Array.from(article.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Publish",
    )!;

    await Promise.all([user.click(publishBtn), user.click(publishBtn)]);

    await waitFor(() => {
      expect(
        calls.some(
          (call) => call.method === "POST" && call.url.includes("/publish"),
        ),
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
    await waitFor(() => {
      expect(
        Array.from(article.querySelectorAll("button")).some(
          (btn) => btn.textContent === "Publish",
        ),
      ).toBe(true);
    });
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
      onContentGet: (_call, contentId) =>
        mockJsonResponse(
          sampleContentResponse({
            content_id: contentId,
            current_version_id:
              contentId === worksheet.content_id
                ? "99999999-9999-9999-9999-999999999999"
                : worksheet.version_id,
            stewardship_state: "APPROVED",
            published_version_id: null,
          }),
          { etag: '"r3"' },
        ),
    });
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await waitFor(() => {
      expect(article.getAttribute("data-lifecycle")).toBe("approved");
    });
    expect(
      Array.from(article.querySelectorAll("button")).some(
        (btn) => btn.textContent === "Publish",
      ),
    ).toBe(false);
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
      artifacts: withStates({ worksheet: "APPROVED" }),
      publishedVersionByContentId: {
        [worksheet.content_id]: worksheet.version_id,
      },
    });
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await waitFor(() => {
      expect(article.getAttribute("data-lifecycle")).toBe("published");
    });
    expect(
      Array.from(article.querySelectorAll("button")).some(
        (btn) => btn.textContent === "Publish",
      ),
    ).toBe(false);
    expect(
      calls.some(
        (call) => call.method === "POST" && call.url.includes("/publish"),
      ),
    ).toBe(false);
  });

  it("14–15 + R1. Successful publish keeps Work stewardship APPROVED, Content published_version_id drives Published UI; others unaffected", async () => {
    const calls = stubLifecycleSurface();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();
    const worksheet = samplePreparationKitArtifacts().items.find(
      (item) => item.artifact_kind === "worksheet",
    )!;

    expect(
      await screen.findByTestId("work-lifecycle-summary"),
    ).toHaveTextContent(/6 artifacts · 5 in review · 1 approved/);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await waitFor(() => {
      expect(
        Array.from(article.querySelectorAll("button")).some(
          (btn) => btn.textContent === "Publish",
        ),
      ).toBe(true);
    });
    await user.click(
      Array.from(article.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Publish",
      )!,
    );

    await waitFor(() => {
      expect(article.getAttribute("data-lifecycle")).toBe("published");
    });
    expect(article.getAttribute("data-stewardship")).toBe("APPROVED");
    expect(article.textContent).toMatch(/Published/);
    expect(
      Array.from(article.querySelectorAll("button")).some(
        (btn) => btn.textContent === "Publish",
      ),
    ).toBe(false);
    expect(article.querySelector('a[href*="/artifacts/"]')).not.toBeNull();

    expect(screen.getByTestId("work-lifecycle-summary")).toHaveTextContent(
      /6 artifacts · 5 in review · 1 published/,
    );
    expect(screen.getByTestId("work-lifecycle-summary")).not.toHaveTextContent(
      /1 approved/,
    );

    const contentGetsAfterPublish = calls.filter(
      (call) =>
        call.method === "GET" &&
        isContentGetPath(call.url, worksheet.content_id),
    );
    expect(contentGetsAfterPublish.length).toBeGreaterThanOrEqual(2);

    for (const label of [
      "Lesson Plan",
      "Quick Quiz",
      "Homework",
      "Answer Key",
      "Teacher Notes",
    ]) {
      const other = screen
        .getByRole("heading", { name: label })
        .closest("article")!;
      expect(other.getAttribute("data-stewardship")).toBe("IN_REVIEW");
      expect(other.getAttribute("data-lifecycle")).toBe("in_review");
      expect(other.textContent).not.toMatch(/\bPublished\b/);
    }
  });

  it("R1 reload preserves Published from Content published_version_id", async () => {
    const worksheet = samplePreparationKitArtifacts().items.find(
      (item) => item.artifact_kind === "worksheet",
    )!;
    stubLifecycleSurface({
      artifacts: withStates({ worksheet: "APPROVED" }),
      publishedVersionByContentId: {
        [worksheet.content_id]: worksheet.version_id,
      },
    });
    renderApp(WORK_ROUTE);

    const card = await screen.findByRole("heading", { name: "Worksheet" });
    const article = card.closest("article")!;
    await waitFor(() => {
      expect(article.getAttribute("data-lifecycle")).toBe("published");
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Reload from server/i }),
    );
    await waitFor(() => {
      expect(article.getAttribute("data-lifecycle")).toBe("published");
    });
    expect(article.getAttribute("data-stewardship")).toBe("APPROVED");
    expect(screen.getByTestId("work-lifecycle-summary")).toHaveTextContent(
      /1 published/,
    );
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
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    });
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toBeInTheDocument();
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

  it("9. No DEV05 production/test path requires PUBLISHED stewardship", () => {
    expect(JSON.stringify(withStates({ worksheet: "APPROVED" }))).not.toMatch(
      /"PUBLISHED"/,
    );
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
      if (isContentGetPath(call.url, CONTENT_ID)) {
        return mockJsonResponse(
          sampleContentResponse({
            stewardship_state: "APPROVED",
            published_version_id: null,
          }),
          { etag: '"r3"' },
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
