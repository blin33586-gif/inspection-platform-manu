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
        <div className="card-grid">{data.items.map((item) => <ObjectCard key={item.id} item={item} to={`/communities/${item.id}`} />)}</div>
      </section>
    </>
  );
}
