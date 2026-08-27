import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";
import { SessionProvider } from "@/services/session/SessionContext";
import {
  devSessionConnector,
  type DevSession,
} from "@/services/session/DevSessionConnector";
import { TeacherOsShell } from "@/features/teacher-os/shell/TeacherOsShell";
import { TodayPage } from "@/features/teacher-os/today/TodayPage";
import { ReviewQueuePage } from "@/features/teacher-os/review/ReviewQueuePage";
import { ReviewDetailPage } from "@/features/teacher-os/review/ReviewDetailPage";
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
            <Route
              path="prepare"
              element={<PlaceholderPage title="Prepare" slug="prepare" />}
            />
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
