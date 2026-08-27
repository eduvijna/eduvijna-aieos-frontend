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
  MissionContinueWork,
  TeacherOsMission,
  TeachingWork,
} from "@/services/api/generated/teachingTypes";
import { TeacherOsShell } from "@/features/teacher-os/shell/TeacherOsShell";
import { TodayPage } from "@/features/teacher-os/today/TodayPage";
import { ReviewQueuePage } from "@/features/teacher-os/review/ReviewQueuePage";
import { ReviewDetailPage } from "@/features/teacher-os/review/ReviewDetailPage";
import { PreparePage } from "@/features/teacher-os/prepare/PreparePage";
import { WorkPage } from "@/features/teacher-os/work/WorkPage";
import { PlaceholderPage } from "@/features/teacher-os/placeholders/PlaceholderPage";
import { SettingsPage } from "@/features/teacher-os/placeholders/SettingsPage";

export const DEV_SESSION: DevSession = {
  apiOrigin: "http://127.0.0.1:8000",
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
              path="teach"
              element={<PlaceholderPage title="Teach" slug="teach" />}
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
