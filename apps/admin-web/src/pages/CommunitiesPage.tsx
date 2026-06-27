import { Button } from "antd";
import type { ManagedObjectSummary, PageResult } from "@xunjianbao/shared";
import { communities } from "../data";
import { ObjectCard } from "../components/ObjectCard";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackCommunities: PageResult<ManagedObjectSummary> = {
  items: communities,
  page: 1,
  pageSize: 20,
  total: communities.length,
};

export function CommunitiesPage() {
  const { data } = useApiResource("/communities", fallbackCommunities);

  return (
    <>
      <PageHeader eyebrow="COMMUNITY ARCHIVES" title="小区档案" actions={<Button type="primary">新增小区</Button>} />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">COMMUNITY LIST</p>
            <h3>曲阳路街道小区</h3>
          </div>
          <div className="filter-bar"><button className="active">全部</button><button>待复查</button><button>重点</button><button>稳定</button></div>
        </div>
        <div className="card-grid">{data.items.map((item) => <ObjectCard key={item.id} item={item} />)}</div>
      </section>

      <section className="content-section detail-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">COMMUNITY DETAIL</p>
            <h3>小区详情示例：玉田新村</h3>
          </div>
        </div>
        <div className="detail-layout">
          <article className="detail-hero">
            <div className="detail-title">
              <span className="status pending">待复查</span>
              <h4>玉田新村</h4>
              <p>老旧小区，当前重点关注飞线充电、公共区域堆物和装修垃圾。</p>
            </div>
            <div className="detail-kpis">
              <div><span>本月巡检</span><strong>3</strong></div>
              <div><span>发现问题</span><strong>12</strong></div>
              <div><span>待处理</span><strong>6</strong></div>
              <div><span>关联报告</span><strong>4</strong></div>
            </div>
          </article>
          <aside className="timeline-panel">
            <h4>问题时间线</h4>
            <div className="timeline">
              <div><time>06-24</time><strong>飞线充电 4 处</strong><span>已生成巡检报告，待社区复核。</span></div>
              <div><time>06-18</time><strong>公共区域堆物</strong><span>整改中，需下次无人机复查。</span></div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
