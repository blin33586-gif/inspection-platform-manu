import { useNavigate } from "react-router-dom";
import type { IssueSummary, MapHotAreaSummary } from "@xunjianbao/shared";
import { dashboardSummary, issueDistribution } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const legendClasses = ["blue", "orange", "red", "green"];

interface DashboardMapData {
  mapAssetId: string;
  hotAreas: MapHotAreaSummary[];
  issues: IssueSummary[];
}

const fallbackMapData: DashboardMapData = {
  mapAssetId: "map-street-main",
  hotAreas: [
    { id: "ha-yutian", label: "玉田新村", objectType: "community", objectId: "c-yutian", x: 18, y: 32, width: 24, height: 18 },
    { id: "ha-quyang", label: "曲阳路", objectType: "road", objectId: "r-quyang", x: 46, y: 50, width: 20, height: 8 },
    { id: "ha-river", label: "河道绿化带", objectType: "point", objectId: "p-river-001", x: 9, y: 78, width: 31, height: 7 },
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
  const { data: summary } = useApiResource("/dashboard/summary", dashboardSummary);
  const { data: distribution } = useApiResource("/dashboard/issue-distribution", issueDistribution);
  const { data: mapData } = useApiResource<DashboardMapData>("/dashboard/map", fallbackMapData);

  return (
    <>
      <PageHeader
        eyebrow="QUYANG ROAD SUBDISTRICT"
        title="曲阳路街道无人机巡检驾驶舱"
        actions={
          <>
            <button className="ghost-button">导入地图</button>
            <button className="primary-button">上传报告</button>
          </>
        }
      />

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">城市综合管理</p>
          <h2>用一张街道地图进入所有巡检档案</h2>
          <p>小区、道路、广告牌、河道和重点点位都可以在首页地图上直接点击进入。</p>
        </div>
        <div className="hero-stats">
          <div><span>本月巡检</span><strong>{summary.inspectionsThisMonth}</strong></div>
          <div><span>发现问题</span><strong>{summary.issuesThisMonth}</strong></div>
          <div><span>待处理</span><strong>{summary.pendingIssues}</strong></div>
        </div>
      </section>

      <section className="workspace-grid">
        <article className="map-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">INTERACTIVE MAP</p>
              <h3>街道二维地图</h3>
            </div>
            <div className="layer-tabs">
              <button className="active">小区</button>
              <button>道路</button>
              <button>问题</button>
            </div>
          </div>

          <div className="district-map">
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
                  onClick={() => navigate(objectPath(area))}
                >
                  {area.label}
                  <span>{objectTypeLabel(area)} / 问题 {relatedIssueCount}</span>
                </button>
              );
            })}
            <button className="issue-dot urgent" aria-label="待处理问题" onClick={() => navigate("/issues")} />
            <button className="issue-dot pending" aria-label="处理中问题" onClick={() => navigate("/issues")} />
            <button className="issue-dot done" aria-label="已整改问题" onClick={() => navigate("/issues")} />
            <div className="map-tooltip">
              <strong>玉田新村</strong>
              <span>本月巡检 3 次 / 最新报告 06-24</span>
            </div>
          </div>
        </article>

        <aside className="insight-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">ANALYTICS</p>
              <h3>问题分布</h3>
            </div>
          </div>
          <div className="donut-wrap">
            <div className="donut" />
            <ul className="legend">
              {distribution.map((item, index) => (
                <li key={item.category}>
                  <span className={legendClasses[index % legendClasses.length]} />
                  {item.category} {item.value}%
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </>
  );
}
