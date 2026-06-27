import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { getToken } from "./auth/session";
import { Shell } from "./components/Shell";
import { DashboardPage } from "./pages/DashboardPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { RoadsPage } from "./pages/RoadsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { IssuesPage } from "./pages/IssuesPage";
import { MapAssetsPage } from "./pages/MapAssetsPage";
import { LoginPage } from "./pages/LoginPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { ManagedObjectDetailPage } from "./pages/ManagedObjectDetailPage";
import { MapAssetDetailPage } from "./pages/MapAssetDetailPage";

function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/communities" element={<CommunitiesPage />} />
          <Route path="/communities/:id" element={<ManagedObjectDetailPage objectType="community" />} />
          <Route path="/roads" element={<RoadsPage />} />
          <Route path="/roads/:id" element={<ManagedObjectDetailPage objectType="road" />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/map-assets" element={<MapAssetsPage />} />
          <Route path="/map-assets/:id" element={<MapAssetDetailPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
