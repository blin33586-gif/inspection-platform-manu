import { useNavigate } from "react-router-dom";
import type { IssueSummary, MapHotAreaSummary } from "@xunjianbao/shared";
import { ApiResourceError } from "../components/ApiResourceError";
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

function objectTypeLabel(area: MapHotAreaSummary) {
  if (area.objectType === "community") return "小区";
  if (area.objectType === "road") return "道路";
  if (area.objectType === "point") return "点位";
  return "街道";
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: mapData, error, reload } = useApiResource<DashboardMapData>("/dashboard/map", fallbackMapData);

  if (error) return <ApiResourceError error={error} onRetry={reload} />;

  return (
    <section className="home-landing">
      <div className="home-copy">
        <h1>曲阳街道一览</h1>
      </div>

      <div className="tif-map-stage">
        <div className="tif-map-canvas">
          <div className="tif-road tif-road-main">曲阳路</div>
          <div className="tif-road tif-road-second">密云路</div>
          <div className="tif-river">河道绿化带</div>
          {mapData.hotAreas.map((area) => {
            const relatedIssueCount = mapData.issues.filter((issue) => issue.objectName === area.label).length;
            return (
              <button
                className={`dashboard-hot-area ${area.objectType}`}
                key={area.id}
                style={{
                  left: `${area.x ?? 10}%`,
                  top: `${area.y ?? 10}%`,
                  width: `${area.width ?? 20}%`,
                  height: `${area.height ?? 10}%`,
                }}
                type="button"
                onClick={() => navigate(objectPath(area))}
              >
                {area.label}
                <span>{objectTypeLabel(area)} / 问题 {relatedIssueCount}</span>
              </button>
            );
          })}
          <button className="issue-dot urgent" type="button" aria-label="待处理问题" onClick={() => navigate("/issues?status=pending")} />
          <button className="issue-dot pending" type="button" aria-label="处理中问题" onClick={() => navigate("/issues?status=processing")} />
          <button className="issue-dot done" type="button" aria-label="复查通过问题" onClick={() => navigate("/issues?status=verified")} />
        </div>
      </div>
    </section>
  );
}
