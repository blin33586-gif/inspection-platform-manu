import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { DashboardPage } from "./pages/DashboardPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { RoadsPage } from "./pages/RoadsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { IssuesPage } from "./pages/IssuesPage";
import { MapAssetsPage } from "./pages/MapAssetsPage";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/communities" element={<CommunitiesPage />} />
        <Route path="/roads" element={<RoadsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/issues" element={<IssuesPage />} />
        <Route path="/map-assets" element={<MapAssetsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
