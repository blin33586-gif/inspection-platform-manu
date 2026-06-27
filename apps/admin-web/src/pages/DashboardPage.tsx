import { useNavigate } from "react-router-dom";
import { dashboardSummary, issueDistribution } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const legendClasses = ["blue", "orange", "red", "green"];

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: summary } = useApiResource("/dashboard/summary", dashboardSummary);
  const { data: distribution } = useApiResource("/dashboard/issue-distribution", issueDistribution);

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
            <button className="map-label community one" onClick={() => navigate("/communities")}>玉田新村<span>待处理 6</span></button>
            <button className="map-label community two" onClick={() => navigate("/communities")}>赤峰小区<span>飞线 4</span></button>
            <button className="map-label community three" onClick={() => navigate("/communities")}>运光小区<span>违建 2</span></button>
            <button className="map-label road road-one" onClick={() => navigate("/roads")}>曲阳路</button>
            <button className="map-label road road-two" onClick={() => navigate("/roads")}>密云路</button>
            <button className="issue-dot urgent" aria-label="待处理问题" onClick={() => navigate("/issues")} />
            <button className="issue-dot pending" aria-label="处理中问题" onClick={() => navigate("/issues")} />
            <button className="issue-dot done" aria-label="已整改问题" onClick={() => navigate("/issues")} />
            <div className="map-river">河道绿化带</div>
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
