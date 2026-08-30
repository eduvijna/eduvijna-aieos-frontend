import { Navigate, Route, Routes } from "react-router-dom";
import { TeacherOsShell } from "@/features/teacher-os/shell/TeacherOsShell";
import { TodayPage } from "@/features/teacher-os/today/TodayPage";
import { ReviewQueuePage } from "@/features/teacher-os/review/ReviewQueuePage";
import { ReviewDetailPage } from "@/features/teacher-os/review/ReviewDetailPage";
import { PreparePage } from "@/features/teacher-os/prepare/PreparePage";
import { WorkPage } from "@/features/teacher-os/work/WorkPage";
import { ArtifactViewPage } from "@/features/teacher-os/work/ArtifactViewPage";
import { PlaceholderPage } from "@/features/teacher-os/placeholders/PlaceholderPage";
import { SettingsPage } from "@/features/teacher-os/placeholders/SettingsPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/teacher-os/today" replace />} />
      <Route path="/teacher-os" element={<TeacherOsShell />}>
        <Route index element={<Navigate to="today" replace />} />
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
      <Route path="*" element={<Navigate to="/teacher-os/today" replace />} />
    </Routes>
  );
}
