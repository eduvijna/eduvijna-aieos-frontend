import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_ID,
  emptyWorkArtifacts,
  isWorkArtifactsPath,
  isWorkGeneratePath,
  isWorkGetPath,
  mockJsonResponse,
  mockProblemResponse,
  renderApp,
  sampleDetail,
  sampleGenerateResponse,
  sampleWork,
  sampleWorkArtifact,
  stubFetch,
  VERSION_ID,
  WORK_ID,
  workArtifactsWith,
  type FetchCall,
} from "@/test/test-utils";

const WORK_ROUTE = `/teacher-os/work/${WORK_ID}`;
const GENERATE_PATH = `/api/v1/teaching/works/${WORK_ID}/actions/generate`;
const ARTIFACTS_PATH = `/api/v1/teaching/works/${WORK_ID}/artifacts`;
const REVIEW_DETAIL_PATH = `/api/v1/teacher-os/review-queue/${CONTENT_ID}/versions/${VERSION_ID}`;

function stubWorkSurface(options?: {
  artifacts?: ReturnType<typeof workArtifactsWith> | ReturnType<typeof emptyWorkArtifacts>;
  onGenerate?: (call: FetchCall) => Response | Promise<Response>;
  workRevision?: number;
}) {
  const artifacts = options?.artifacts ?? emptyWorkArtifacts();
  const work = {
    ...sampleWork,
    aggregate_revision: options?.workRevision ?? sampleWork.aggregate_revision,
  };
  return stubFetch((call) => {
    if (isWorkArtifactsPath(call.url)) {
      return mockJsonResponse(artifacts);
    }
    if (isWorkGeneratePath(call.url) && call.method === "POST") {
      if (options?.onGenerate) return options.onGenerate(call);
      return mockJsonResponse(sampleGenerateResponse);
    }
    if (call.url.includes(REVIEW_DETAIL_PATH) || call.url.endsWith(
      `/review-queue/${CONTENT_ID}/versions/${VERSION_ID}`,
    )) {
      return mockJsonResponse(sampleDetail, { etag: '"r2"' });
    }
    if (isWorkGetPath(call.url)) {
      return mockJsonResponse(work, {
        etag: `"r${work.aggregate_revision}"`,
      });
    }
    return mockJsonResponse({ title: "Not Found", status: 404 }, { status: 404 });
  });
}

describe("§46 Work generate preparation draft", () => {
  it("shows Generate preparation draft when no artifact exists", async () => {
    stubWorkSurface();
    renderApp(WORK_ROUTE);

    expect(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Worksheet Generator/i)).toBeNull();
  });

  it("offers no generator-grid document tiles", async () => {
    stubWorkSurface();
    renderApp(WORK_ROUTE);
    await screen.findByRole("button", {
      name: /Generate preparation draft/i,
    });
    for (const label of [
      /Generate Worksheet/i,
      /Generate Quiz/i,
      /Generate Lesson Plan/i,
      /Create Worksheet/i,
    ]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
  });

  it("POSTs generate with If-Match and Idempotency-Key and no body fields", async () => {
    const calls = stubWorkSurface();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    );

    await waitFor(() => {
      expect(
        calls.some((call) => call.method === "POST" && isWorkGeneratePath(call.url)),
      ).toBe(true);
    });

    const post = calls.find(
      (call) => call.method === "POST" && isWorkGeneratePath(call.url),
    );
    expect(post?.url).toBe(GENERATE_PATH);
    expect(post?.headers.get("If-Match")).toBe('"r1"');
    expect(post?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post?.body).toBeUndefined();
    expect(post?.headers.get("Content-Type")).toBeNull();
  });

  it("navigates to Review detail on successful generate", async () => {
    stubWorkSurface();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: sampleDetail.title,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Approve$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Publish/i })).toBeNull();
  });

  it("shows Creating your preparation draft while waiting", async () => {
    let resolveGenerate!: (value: Response) => void;
    const generatePromise = new Promise<Response>((resolve) => {
      resolveGenerate = resolve;
    });
    stubWorkSurface({
      onGenerate: () => generatePromise,
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    );

    expect(
      await screen.findByText(/Creating your preparation draft…/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/agent/i)).toBeNull();

    resolveGenerate(mockJsonResponse(sampleGenerateResponse));
    await screen.findByRole("heading", { name: sampleDetail.title });
  });

  it("reopened Work shows the worksheet draft artifact and educational checks", async () => {
    stubWorkSurface({ artifacts: workArtifactsWith(sampleWorkArtifact) });
    renderApp(WORK_ROUTE);

    expect(
      await screen.findByRole("heading", { name: /Worksheet draft/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Waiting for review/i)).toBeInTheDocument();
    expect(screen.getByText(/age_appropriate/i)).toBeInTheDocument();
    expect(screen.getByText(/Language fits Grade 5\./i)).toBeInTheDocument();
    expect(screen.getByText(/curriculum_aligned/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Review draft/i }),
    ).toHaveAttribute(
      "href",
      `/teacher-os/review/${CONTENT_ID}/versions/${VERSION_ID}`,
    );
    expect(
      screen.queryByRole("button", { name: /Generate preparation draft/i }),
    ).toBeNull();
  });

  it("on 412 reloads Work and asks the teacher to generate from latest", async () => {
    let workReads = 0;
    const calls = stubFetch((call) => {
      if (isWorkArtifactsPath(call.url)) {
        return mockJsonResponse(emptyWorkArtifacts());
      }
      if (isWorkGeneratePath(call.url)) {
        return mockProblemResponse(
          412,
          "work_generation_revision_conflict",
          "Work generation revision conflict",
        );
      }
      if (isWorkGetPath(call.url)) {
        workReads += 1;
        return workReads === 1
          ? mockJsonResponse(sampleWork, { etag: '"r1"' })
          : mockJsonResponse(
              {
                ...sampleWork,
                topic: "Chlorophyll",
                aggregate_revision: 4,
              },
              { etag: '"r4"' },
            );
      }
      return mockJsonResponse({ title: "Not Found", status: 404 }, { status: 404 });
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    );

    expect(
      await screen.findByText(/generate again from this revision/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/^Topic$/i)).toHaveValue("Chlorophyll");
    });
    expect(
      calls.filter((call) => call.method === "GET" && isWorkGetPath(call.url)),
    ).toHaveLength(2);
  });

  it("reports work_generation_in_progress truthfully", async () => {
    stubWorkSurface({
      onGenerate: () =>
        mockProblemResponse(
          409,
          "work_generation_in_progress",
          "Work generation in progress",
        ),
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    );

    expect(
      await screen.findByText(/already being created for this request/i),
    ).toBeInTheDocument();
  });

  it("on already_exists loads the artifact and offers Review", async () => {
    let artifacts = emptyWorkArtifacts();
    stubFetch((call) => {
      if (isWorkArtifactsPath(call.url)) {
        return mockJsonResponse(artifacts);
      }
      if (isWorkGeneratePath(call.url)) {
        artifacts = workArtifactsWith(sampleWorkArtifact);
        return mockProblemResponse(
          409,
          "work_generation_already_exists",
          "Work generation already exists",
        );
      }
      if (isWorkGetPath(call.url)) {
        return mockJsonResponse(sampleWork, { etag: '"r1"' });
      }
      return mockJsonResponse({ title: "Not Found", status: 404 }, { status: 404 });
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    );

    expect(
      await screen.findByRole("heading", { name: /Worksheet draft/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A preparation draft already exists/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Review draft/i }),
    ).toBeInTheDocument();
  });

  it("reports educational_quality_failed as no artifact created", async () => {
    stubWorkSurface({
      onGenerate: () =>
        mockProblemResponse(
          422,
          "educational_quality_failed",
          "Educational quality failed",
        ),
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    );

    expect(
      await screen.findByText(/No draft was created/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Worksheet draft/i }),
    ).toBeNull();
  });

  it("reports provider failure as retry later", async () => {
    stubWorkSurface({
      onGenerate: () =>
        mockProblemResponse(
          503,
          "model_provider_unavailable",
          "Model provider unavailable",
        ),
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Generate preparation draft/i,
      }),
    );

    expect(
      await screen.findByText(/could not be created right now\. Try again later/i),
    ).toBeInTheDocument();
  });

  it("never writes artifact state to browser storage", async () => {
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = vi.spyOn(window.sessionStorage, "setItem");
    stubWorkSurface({ artifacts: workArtifactsWith(sampleWorkArtifact) });
    renderApp(WORK_ROUTE);

    await screen.findByRole("heading", { name: /Worksheet draft/i });
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });

  it("loads artifacts from the teaching works path only", async () => {
    const calls = stubWorkSurface({
      artifacts: workArtifactsWith(sampleWorkArtifact),
    });
    renderApp(WORK_ROUTE);
    await screen.findByRole("heading", { name: /Worksheet draft/i });

    expect(
      calls.some(
        (call) =>
          call.method === "GET" && call.url === ARTIFACTS_PATH,
      ),
    ).toBe(true);
  });
});
