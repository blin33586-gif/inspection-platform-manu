import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { canManagePlatform } from "./auth/project-access";
import { getCurrentProject, getToken, getUser } from "./auth/session";
import { Shell } from "./components/Shell";
import { DashboardPage } from "./pages/DashboardPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { RoadsPage } from "./pages/RoadsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { IssuesPage } from "./pages/IssuesPage";
import { MapAssetsPage } from "./pages/MapAssetsPage";
import { MediaLibraryPage } from "./pages/MediaLibraryPage";
import { MediaTaskDetailPage } from "./pages/MediaTaskDetailPage";
import { LoginPage } from "./pages/LoginPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { ManagedObjectDetailPage } from "./pages/ManagedObjectDetailPage";
import { MapAssetDetailPage } from "./pages/MapAssetDetailPage";
import { PointsPage } from "./pages/PointsPage";
import { PointDetailPage } from "./pages/PointDetailPage";
import { IssueDetailPage } from "./pages/IssueDetailPage";
import { ReportDetailPage } from "./pages/ReportDetailPage";
import { ReportWritePage } from "./pages/ReportWritePage";
import { PublicIssueSharePage } from "./pages/PublicIssueSharePage";
import { ProjectSelectPage } from "./pages/ProjectSelectPage";
import { PlatformMembersPage } from "./pages/PlatformMembersPage";

function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />;
}

function RequireProject() {
  return getCurrentProject() ? <Outlet /> : <Navigate to="/projects" replace />;
}

function RequirePlatformAdmin() {
  return canManagePlatform(getUser()?.role) ? <Outlet /> : <Navigate to="/projects" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/s/issue/:shareToken" element={<PublicIssueSharePage />} />
      <Route element={<RequireAuth />}>
        <Route path="/projects" element={<ProjectSelectPage />} />
        <Route element={<RequirePlatformAdmin />}>
          <Route path="/platform/members" element={<PlatformMembersPage />} />
        </Route>
        <Route element={<RequireProject />}>
          <Route element={<Shell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/communities" element={<CommunitiesPage />} />
          <Route path="/communities/:id" element={<ManagedObjectDetailPage objectType="community" />} />
          <Route path="/roads" element={<RoadsPage />} />
          <Route path="/roads/:id" element={<ManagedObjectDetailPage objectType="road" />} />
          <Route path="/points" element={<PointsPage />} />
          <Route path="/points/:id" element={<PointDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/write" element={<ReportWritePage />} />
          <Route path="/reports/:id" element={<ReportDetailPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/issues/:id" element={<IssueDetailPage />} />
          <Route path="/media-library" element={<MediaLibraryPage />} />
          <Route path="/media-library/:taskId" element={<MediaTaskDetailPage />} />
          <Route path="/map-assets" element={<MapAssetsPage />} />
          <Route path="/map-assets/:id" element={<MapAssetDetailPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
