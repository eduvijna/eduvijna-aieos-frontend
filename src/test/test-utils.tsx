import { render } from "@testing-library/react";
import { vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";
import { SessionProvider } from "@/services/session/SessionContext";
import {
  devSessionConnector,
  type DevSession,
} from "@/services/session/DevSessionConnector";
import type {
  EducationalQuality,
  MissionContinueWork,
  TeacherOsMission,
  TeachingWork,
  TeachingWorkArtifactsResponse,
  TeachingWorkGenerateResponse,
  TeachingWorkPrepareResponse,
  WorkArtifactItem,
} from "@/services/api/generated/teachingTypes";
import { PREPARATION_ARTIFACT_KINDS } from "@/features/teacher-os/work/preparationKit";
import { TeacherOsShell } from "@/features/teacher-os/shell/TeacherOsShell";
import { TodayPage } from "@/features/teacher-os/today/TodayPage";
import { ReviewQueuePage } from "@/features/teacher-os/review/ReviewQueuePage";
import { ReviewDetailPage } from "@/features/teacher-os/review/ReviewDetailPage";
import { PreparePage } from "@/features/teacher-os/prepare/PreparePage";
import { WorkPage } from "@/features/teacher-os/work/WorkPage";
import { ArtifactViewPage } from "@/features/teacher-os/work/ArtifactViewPage";
import { TeachPage } from "@/features/teacher-os/teach/TeachPage";
import { AssignmentDetailPage } from "@/features/teacher-os/teach/AssignmentDetailPage";
import { PlaceholderPage } from "@/features/teacher-os/placeholders/PlaceholderPage";
import { SettingsPage } from "@/features/teacher-os/placeholders/SettingsPage";
import type {
  ContentResponse,
  ContentVersionResponse,
  PublicationResponse,
} from "@/services/api/contentApi";

export const DEV_SESSION: DevSession = {
  apiOrigin: "http://127.0.0.1:8080",
  tenantId: "tenant-dev-1",
  bearerToken: "test-token-not-for-storage",
};

export function connectDevSession(session: DevSession = DEV_SESSION): void {
  devSessionConnector?.connect(session);
}

export function renderWithProviders(
  ui: ReactElement,
  options?: { route?: string; session?: DevSession | null },
) {
  if (options?.session) {
    connectDevSession(options.session);
  } else if (options?.session === null) {
    devSessionConnector?.disconnect();
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SessionProvider>
        <MemoryRouter initialEntries={[options?.route ?? "/teacher-os/today"]}>
          {children}
        </MemoryRouter>
      </SessionProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

export function renderApp(
  route = "/teacher-os/today",
  session: DevSession | null | undefined = DEV_SESSION,
) {
  if (session) {
    connectDevSession(session);
  } else if (session === null) {
    devSessionConnector?.disconnect();
  }

  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/teacher-os" element={<TeacherOsShell />}>
            <Route path="today" element={<TodayPage />} />
            <Route path="review" element={<ReviewQueuePage />} />
            <Route
              path="review/:contentId/versions/:versionId"
              element={<ReviewDetailPage />}
            />
            <Route path="prepare" element={<PreparePage />} />
            <Route path="work/:workId" element={<WorkPage />} />
            <Route
              path="work/:workId/artifacts/:contentId/versions/:versionId"
              element={<ArtifactViewPage />}
            />
            <Route path="teach" element={<TeachPage />} />
            <Route
              path="teach/assignments/:assignmentId"
              element={<AssignmentDetailPage />}
            />
            <Route
              path="assess"
              element={<PlaceholderPage title="Assess" slug="assess" />}
            />
            <Route
              path="improve"
              element={<PlaceholderPage title="Improve" slug="improve" />}
            />
            <Route
              path="library"
              element={<PlaceholderPage title="Library" slug="library" />}
            />
            <Route
              path="ai-assistant"
              element={
                <PlaceholderPage title="AI Assistant" slug="ai-assistant" />
              }
            />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

export const sampleQueueItem = {
  content_id: "11111111-1111-1111-1111-111111111111",
  version_id: "22222222-2222-2222-2222-222222222222",
  version_number: 1,
  content_type: "lesson.plan",
  title: "Photosynthesis draft",
  description: "Draft for review",
  locale: "en-IN",
  artifact_status: "In Review",
  origin: "teacher",
  aggregate_revision: 2,
  submitted_at: "2026-08-20T10:00:00Z",
  version_created_at: "2026-08-20T09:00:00Z",
  published_version_id: null as string | null,
};

export const sampleDetail = {
  ...sampleQueueItem,
  schema_id: "lesson.plan",
  schema_version: 1,
  payload: {
    objective: "Explain photosynthesis",
    steps: ["Observe", "Model"],
  },
  payload_sha256: "abc123",
};

export const WORK_ID = "33333333-3333-3333-3333-333333333333";

export function calendarDate(offsetDays: number): string {
  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offsetDays,
  );
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export const sampleWork: TeachingWork = {
  work_id: WORK_ID,
  intent_type: "prepare_tomorrow",
  goal_text: "Explain why leaves look green",
  class_label: "Grade 5B",
  subject: "Science",
  topic: "Photosynthesis",
  target_date: calendarDate(1),
  locale: "en-IN",
  aggregate_revision: 1,
  created_at: "2026-08-27T04:00:00Z",
  updated_at: "2026-08-27T05:00:00Z",
  archived_at: null,
};

export const CONTENT_ID = sampleQueueItem.content_id;
export const VERSION_ID = sampleQueueItem.version_id;

export const sampleEducationalQuality: EducationalQuality = {
  status: "PASS",
  checks: [
    {
      code: "age_appropriate",
      passed: true,
      explanation: "Language fits Grade 5.",
    },
    {
      code: "curriculum_aligned",
      passed: true,
      explanation: "Aligned to photosynthesis.",
    },
  ],
};

export const sampleWorkArtifact: WorkArtifactItem = {
  content_id: CONTENT_ID,
  version_id: VERSION_ID,
  content_type: "worksheet",
  title: "Photosynthesis worksheet draft",
  origin: "AI",
  stewardship_state: "IN_REVIEW",
  aggregate_revision: 1,
  educational_quality: sampleEducationalQuality,
};

const KIT_TITLES: Record<(typeof PREPARATION_ARTIFACT_KINDS)[number], string> = {
  lesson_plan: "Photosynthesis lesson plan",
  worksheet: "Photosynthesis worksheet draft",
  quiz: "Photosynthesis quick quiz",
  homework: "Photosynthesis homework",
  answer_key: "Photosynthesis answer key",
  teacher_notes: "Photosynthesis teacher notes",
};

export function samplePreparationKitArtifacts(
  workId: string = WORK_ID,
): TeachingWorkArtifactsResponse {
  const runId = "55555555-5555-5555-5555-555555555555";
  const items: WorkArtifactItem[] = PREPARATION_ARTIFACT_KINDS.map(
    (kind, index) => {
      const n = String(index + 1).padStart(8, "0");
      return {
        content_id: `${n}-1111-1111-1111-111111111111`,
        version_id: `${n}-2222-2222-2222-222222222222`,
        content_type: kind,
        title: KIT_TITLES[kind],
        origin: "AI",
        stewardship_state: "IN_REVIEW",
        aggregate_revision: 1,
        educational_quality: sampleEducationalQuality,
        artifact_kind: kind,
        generation_run_id: runId,
      };
    },
  );
  return { work_id: workId, items };
}

export const samplePrepareResponse: TeachingWorkPrepareResponse = {
  work_id: WORK_ID,
  generation_run_id: "55555555-5555-5555-5555-555555555555",
  preparation: { status: "ready" },
  artifacts: samplePreparationKitArtifacts().items.map((item) => ({
    artifact_kind: item.artifact_kind!,
    content_id: item.content_id,
    version_id: item.version_id,
    content_type: item.content_type,
    title: item.title,
    stewardship_state: item.stewardship_state,
    aggregate_revision: item.aggregate_revision,
    generation_run_id: item.generation_run_id!,
  })),
  educational_quality: sampleEducationalQuality,
};

export function emptyWorkArtifacts(
  workId: string = WORK_ID,
): TeachingWorkArtifactsResponse {
  return { work_id: workId, items: [] };
}

export function workArtifactsWith(
  item: WorkArtifactItem = sampleWorkArtifact,
  workId: string = WORK_ID,
): TeachingWorkArtifactsResponse {
  return { work_id: workId, items: [item] };
}

export const sampleGenerateResponse: TeachingWorkGenerateResponse = {
  work_id: WORK_ID,
  generation_run_id: "55555555-5555-5555-5555-555555555555",
  artifact: {
    content_id: CONTENT_ID,
    version_id: VERSION_ID,
    content_type: "worksheet",
    title: sampleWorkArtifact.title,
    stewardship_state: "IN_REVIEW",
    aggregate_revision: 1,
  },
  educational_quality: sampleEducationalQuality,
};

export function isWorkGetPath(url: string, workId: string = WORK_ID): boolean {
  return (
    url === `/api/v1/teaching/works/${workId}` ||
    url.startsWith(`/api/v1/teaching/works/${workId}?`)
  );
}

export function isWorkArtifactsPath(
  url: string,
  workId: string = WORK_ID,
): boolean {
  return url.includes(`/api/v1/teaching/works/${workId}/artifacts`);
}

export function isWorkGeneratePath(
  url: string,
  workId: string = WORK_ID,
): boolean {
  return url.includes(`/api/v1/teaching/works/${workId}/actions/generate`);
}

export function isWorkPreparePath(
  url: string,
  workId: string = WORK_ID,
): boolean {
  return url.includes(`/api/v1/teaching/works/${workId}/actions/prepare`);
}

export function isContentGetPath(url: string, contentId: string): boolean {
  return (
    url === `/api/v1/contents/${contentId}` ||
    url.startsWith(`/api/v1/contents/${contentId}?`)
  );
}

export function isContentVersionGetPath(
  url: string,
  contentId: string,
  versionId: string,
): boolean {
  return (
    url === `/api/v1/contents/${contentId}/versions/${versionId}` ||
    url.startsWith(`/api/v1/contents/${contentId}/versions/${versionId}?`)
  );
}

export function isContentPublishPath(url: string, contentId: string): boolean {
  return url.includes(`/api/v1/contents/${contentId}/actions/publish`);
}

export function sampleContentResponse(
  overrides?: Partial<ContentResponse>,
): ContentResponse {
  return {
    content_id: CONTENT_ID,
    content_type: "worksheet",
    title: sampleWorkArtifact.title,
    description: "Generated draft",
    locale: "en-IN",
    stewardship_state: "APPROVED",
    current_version_id: VERSION_ID,
    published_version_id: null,
    aggregate_revision: 3,
    created_at: "2026-08-27T04:00:00Z",
    updated_at: "2026-08-27T09:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

export function sampleContentVersionResponse(
  overrides?: Partial<ContentVersionResponse>,
): ContentVersionResponse {
  return {
    content_id: CONTENT_ID,
    version_id: VERSION_ID,
    version_number: 1,
    schema_id: "worksheet",
    schema_version: 1,
    payload: { prompt: "Name one part of a leaf", note: "safe" },
    payload_sha256: "abc123",
    origin: "AI",
    parent_version_id: null,
    created_at: "2026-08-27T08:00:00Z",
    ...overrides,
  };
}

export function samplePublicationResponse(
  overrides?: Partial<PublicationResponse>,
): PublicationResponse {
  return {
    publication_id: "99999999-9999-9999-9999-999999999999",
    content_id: CONTENT_ID,
    version_id: VERSION_ID,
    published_version_id: VERSION_ID,
    published_at: "2026-08-27T10:00:00Z",
    approval_decision_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    aggregate_revision: 4,
    ...overrides,
  };
}

export function mockProblemResponse(
  status: number,
  code: string,
  title = code,
): Response {
  return mockJsonResponse(
    {
      type: "about:blank",
      title,
      status,
      detail: title,
      instance: "/api/v1/teaching/works",
      code,
      request_id: "66666666-6666-6666-6666-666666666666",
      correlation_id: "77777777-7777-7777-7777-777777777777",
    },
    { status },
  );
}

export const sampleContinueWork: MissionContinueWork = {
  work_id: sampleWork.work_id,
  intent_type: sampleWork.intent_type,
  goal_text: sampleWork.goal_text,
  class_label: sampleWork.class_label,
  subject: sampleWork.subject,
  topic: sampleWork.topic,
  target_date: sampleWork.target_date,
  aggregate_revision: sampleWork.aggregate_revision,
  updated_at: sampleWork.updated_at,
};

/** Mission projections matching the three backend hero priorities. */
export function missionWithReview(pendingCount = 3): TeacherOsMission {
  return {
    mission_date: calendarDate(0),
    review: { pending_count: pendingCount },
    preparation: { active_work_count: 0, continue_work: null },
    hero_action: { kind: "review", work_id: null },
  };
}

export function missionWithContinueWork(): TeacherOsMission {
  return {
    mission_date: calendarDate(0),
    review: { pending_count: 0 },
    preparation: { active_work_count: 1, continue_work: sampleContinueWork },
    hero_action: { kind: "continue_work", work_id: sampleWork.work_id },
  };
}

export function missionWithPrepareTomorrow(): TeacherOsMission {
  return {
    mission_date: calendarDate(0),
    review: { pending_count: 0 },
    preparation: { active_work_count: 0, continue_work: null },
    hero_action: { kind: "prepare_tomorrow", work_id: null },
  };
}

export function mockJsonResponse(
  body: unknown,
  init?: { status?: number; etag?: string | null },
): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init?.etag) headers.set("ETag", init.etag);
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers,
  });
}

export type FetchCall = {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
};

/** Record every request the app makes so header and body contracts can be asserted. */
export function stubFetch(
  handler: (call: FetchCall) => Response | Promise<Response>,
): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: FetchCall = {
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body:
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as unknown)
            : undefined,
      };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}
