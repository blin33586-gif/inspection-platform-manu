import { useNavigate } from "react-router-dom";
import type { IssueSummary, MapHotAreaSummary } from "@xunjianbao/shared";
import { ApiResourceError } from "../components/ApiResourceError";
import { DashboardTileMap } from "../components/DashboardTileMap";
import { useApiResource } from "../hooks/useApiResource";

interface DashboardMapData {
  mapAssetId: string;
  hotAreas: MapHotAreaSummary[];
  issues: IssueSummary[];
}

const fallbackMapData: DashboardMapData = {
  mapAssetId: "map-street-main",
  hotAreas: [
    { id: "ha-yutian", label: "玉田新村", objectType: "community", objectId: "c-yutian", x: 17, y: 30, width: 23, height: 18 },
    { id: "ha-quyang", label: "曲阳路", objectType: "road", objectId: "r-quyang", x: 45, y: 48, width: 21, height: 8 },
    { id: "ha-river", label: "河道绿化带", objectType: "point", objectId: "p-river-001", x: 8, y: 77, width: 32, height: 7 },
  ],
  issues: [],
};

function objectPath(area: MapHotAreaSummary) {
  if (!area.objectId) return "/map-assets/map-street-main";
  if (area.objectType === "community") return `/communities/${area.objectId}`;
  if (area.objectType === "road") return `/roads/${area.objectId}`;
  if (area.objectType === "point") return `/points/${area.objectId}`;
  return "/map-assets/map-street-main";
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: mapData, error, reload } = useApiResource<DashboardMapData>("/dashboard/map", fallbackMapData);
  const issueCountByObject = mapData.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.objectName] = (counts[issue.objectName] ?? 0) + 1;
    return counts;
  }, {});

  if (error) return <ApiResourceError error={error} onRetry={reload} />;

  return (
    <section className="home-landing">
      <div className="home-copy">
        <h1>曲阳街道一览</h1>
      </div>

      <div className="tif-map-stage">
        <DashboardTileMap
          hotAreas={mapData.hotAreas}
          issueCountByObject={issueCountByObject}
          onOpenArea={(area) => navigate(objectPath(area))}
          onOpenIssues={(status) => navigate(`/issues?status=${status}`)}
        />
      </div>
    </section>
  );
}
