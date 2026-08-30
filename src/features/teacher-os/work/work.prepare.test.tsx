import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyWorkArtifacts,
  isWorkArtifactsPath,
  isWorkGetPath,
  isWorkPreparePath,
  mockJsonResponse,
  mockProblemResponse,
  renderApp,
  sampleDetail,
  samplePreparationKitArtifacts,
  samplePrepareResponse,
  sampleWork,
  sampleWorkArtifact,
  stubFetch,
  workArtifactsWith,
  WORK_ID,
  type FetchCall,
} from "@/test/test-utils";
import { PREPARATION_ARTIFACT_KINDS } from "./preparationKit";

const WORK_ROUTE = `/teacher-os/work/${WORK_ID}`;
const PREPARE_PATH = `/api/v1/teaching/works/${WORK_ID}/actions/prepare`;
const ARTIFACTS_PATH = `/api/v1/teaching/works/${WORK_ID}/artifacts`;

const CANONICAL_LABELS = [
  "Lesson Plan",
  "Worksheet",
  "Quick Quiz",
  "Homework",
  "Answer Key",
  "Teacher Notes",
];

function stubWorkSurface(options?: {
  artifacts?:
    | ReturnType<typeof workArtifactsWith>
    | ReturnType<typeof emptyWorkArtifacts>
    | ReturnType<typeof samplePreparationKitArtifacts>;
  onPrepare?: (call: FetchCall) => Response | Promise<Response>;
  workRevision?: number;
}) {
  let artifacts = options?.artifacts ?? emptyWorkArtifacts();
  const work = {
    ...sampleWork,
    aggregate_revision: options?.workRevision ?? sampleWork.aggregate_revision,
  };
  return stubFetch((call) => {
    if (isWorkArtifactsPath(call.url)) {
      return mockJsonResponse(artifacts);
    }
    if (isWorkPreparePath(call.url) && call.method === "POST") {
      if (options?.onPrepare) return options.onPrepare(call);
      artifacts = samplePreparationKitArtifacts();
      return mockJsonResponse(samplePrepareResponse);
    }
    if (
      call.url.includes(`/review-queue/`) &&
      call.url.includes(`/versions/`)
    ) {
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

describe("TOS-DEV04-I09 Work preparation kit", () => {
  it("shows Create preparation kit when no artifacts exist", async () => {
    stubWorkSurface();
    renderApp(WORK_ROUTE);

    expect(
      await screen.findByRole("button", {
        name: /Create preparation kit/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Worksheet Generator/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Generate preparation draft/i }),
    ).toBeNull();
  });

  it("offers no six-generator button grid", async () => {
    stubWorkSurface();
    renderApp(WORK_ROUTE);
    await screen.findByRole("button", {
      name: /Create preparation kit/i,
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

  it("POSTs prepare with If-Match and Idempotency-Key and no body fields", async () => {
    const calls = stubWorkSurface();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Create preparation kit/i,
      }),
    );

    await waitFor(() => {
      expect(
        calls.some(
          (call) => call.method === "POST" && isWorkPreparePath(call.url),
        ),
      ).toBe(true);
    });

    const post = calls.find(
      (call) => call.method === "POST" && isWorkPreparePath(call.url),
    );
    expect(post?.url).toBe(PREPARE_PATH);
    expect(post?.headers.get("If-Match")).toBe('"r1"');
    expect(post?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(post?.body).toBeUndefined();
    expect(post?.headers.get("Content-Type")).toBeNull();
  });

  it("shows six canonical artifacts after successful prepare", async () => {
    stubWorkSurface();
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Create preparation kit/i,
      }),
    );

    expect(
      await screen.findByRole("heading", { name: /Preparation kit/i }),
    ).toBeInTheDocument();
    for (const label of CANONICAL_LABELS) {
      expect(
        screen.getByRole("heading", { level: 3, name: label }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: /Review Lesson Plan/i }),
    ).toHaveAttribute(
      "href",
      `/teacher-os/review/00000001-1111-1111-1111-111111111111/versions/00000001-2222-2222-2222-222222222222?fromWork=${WORK_ID}`,
    );
    expect(
      screen.getByRole("link", { name: /Review Quick Quiz/i }),
    ).toHaveAttribute(
      "href",
      `/teacher-os/review/00000003-1111-1111-1111-111111111111/versions/00000003-2222-2222-2222-222222222222?fromWork=${WORK_ID}`,
    );
    expect(
      screen.queryByRole("button", { name: /Create preparation kit/i }),
    ).toBeNull();
  });

  it("orders kit artifacts in canonical kind order", async () => {
    const scrambled = samplePreparationKitArtifacts();
    scrambled.items = [...scrambled.items].reverse();
    stubWorkSurface({ artifacts: scrambled });
    renderApp(WORK_ROUTE);

    await screen.findByRole("heading", { name: /Preparation kit/i });
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((node) => node.textContent);
    expect(headings.slice(0, 6)).toEqual(CANONICAL_LABELS);
    expect(PREPARATION_ARTIFACT_KINDS).toHaveLength(6);
  });

  it("shows Creating your preparation kit while waiting and blocks double submit", async () => {
    let resolvePrepare!: (value: Response) => void;
    const preparePromise = new Promise<Response>((resolve) => {
      resolvePrepare = resolve;
    });
    let artifacts = emptyWorkArtifacts();
    const work = { ...sampleWork };
    const calls = stubFetch((call) => {
      if (isWorkArtifactsPath(call.url)) {
        return mockJsonResponse(artifacts);
      }
      if (isWorkPreparePath(call.url) && call.method === "POST") {
        return preparePromise.then((response) => {
          artifacts = samplePreparationKitArtifacts();
          return response;
        });
      }
      if (isWorkGetPath(call.url)) {
        return mockJsonResponse(work, { etag: '"r1"' });
      }
      return mockJsonResponse({ title: "Not Found", status: 404 }, { status: 404 });
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    const button = await screen.findByRole("button", {
      name: /Create preparation kit/i,
    });
    await user.click(button);
    await user.click(button);

    expect(
      await screen.findByText(/Creating your preparation kit…/i),
    ).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/OpenAI/i)).toBeNull();

    await waitFor(() => {
      expect(
        calls.filter(
          (call) => call.method === "POST" && isWorkPreparePath(call.url),
        ),
      ).toHaveLength(1);
    });

    resolvePrepare(mockJsonResponse(samplePrepareResponse));
    await screen.findByRole("heading", { level: 3, name: /Lesson Plan/i });
  });

  it("reopened Work with a historical DEV03 worksheet still renders safely", async () => {
    stubWorkSurface({ artifacts: workArtifactsWith(sampleWorkArtifact) });
    renderApp(WORK_ROUTE);

    expect(
      await screen.findByRole("heading", { name: /Worksheet draft/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/In Review/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/age_appropriate/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Review draft/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Create preparation kit/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { level: 3, name: /Quick Quiz/i }),
    ).toBeNull();
  });

  it("on 412 reloads Work and asks the teacher to prepare from latest", async () => {
    let workReads = 0;
    const calls = stubFetch((call) => {
      if (isWorkArtifactsPath(call.url)) {
        return mockJsonResponse(emptyWorkArtifacts());
      }
      if (isWorkPreparePath(call.url)) {
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
        name: /Create preparation kit/i,
      }),
    );

    expect(
      await screen.findByText(/create the preparation kit again from this revision/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/^Topic$/i)).toHaveValue("Chlorophyll");
    });
    expect(
      calls.filter((call) => call.method === "GET" && isWorkGetPath(call.url)),
    ).toHaveLength(2);
  });

  it("reports work_generation_in_progress truthfully without a second request", async () => {
    const calls = stubWorkSurface({
      onPrepare: () =>
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
        name: /Create preparation kit/i,
      }),
    );

    expect(
      await screen.findByText(/already being created for this request/i),
    ).toBeInTheDocument();
    expect(
      calls.filter(
        (call) => call.method === "POST" && isWorkPreparePath(call.url),
      ),
    ).toHaveLength(1);
  });

  it("on already_exists loads the six-artifact kit", async () => {
    let artifacts = emptyWorkArtifacts();
    stubFetch((call) => {
      if (isWorkArtifactsPath(call.url)) {
        return mockJsonResponse(artifacts);
      }
      if (isWorkPreparePath(call.url)) {
        artifacts = samplePreparationKitArtifacts();
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
        name: /Create preparation kit/i,
      }),
    );

    expect(
      await screen.findByRole("heading", { level: 3, name: /Quick Quiz/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A preparation kit already exists/i),
    ).toBeInTheDocument();
  });

  it("fails closed on preparation_recovery_invariant_violation", async () => {
    stubWorkSurface({
      onPrepare: () =>
        mockProblemResponse(
          409,
          "preparation_recovery_invariant_violation",
          "Preparation recovery invariant violation",
        ),
    });
    renderApp(WORK_ROUTE);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Create preparation kit/i,
      }),
    );

    expect(
      await screen.findByText(/could not be confirmed safely/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: /Lesson Plan/i }),
    ).toBeNull();
  });

  it("reports educational_quality_failed as no complete kit created", async () => {
    stubWorkSurface({
      onPrepare: () =>
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
        name: /Create preparation kit/i,
      }),
    );

    expect(
      await screen.findByText(/No complete preparation kit was created/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: /Lesson Plan/i }),
    ).toBeNull();
  });

  it("reports provider failure as retry later", async () => {
    stubWorkSurface({
      onPrepare: () =>
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
        name: /Create preparation kit/i,
      }),
    );

    expect(
      await screen.findByText(
        /preparation kit could not be created right now\. Try again later/i,
      ),
    ).toBeInTheDocument();
  });

  it("never writes kit state to browser storage", async () => {
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = vi.spyOn(window.sessionStorage, "setItem");
    stubWorkSurface({ artifacts: samplePreparationKitArtifacts() });
    renderApp(WORK_ROUTE);

    await screen.findByRole("heading", { level: 3, name: /Lesson Plan/i });
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });

  it("loads artifacts from the teaching works path only", async () => {
    const calls = stubWorkSurface({
      artifacts: samplePreparationKitArtifacts(),
    });
    renderApp(WORK_ROUTE);
    await screen.findByRole("heading", { level: 3, name: /Lesson Plan/i });

    expect(
      calls.some(
        (call) => call.method === "GET" && call.url === ARTIFACTS_PATH,
      ),
    ).toBe(true);
  });
});
