import { Button } from "antd";
import type { ManagedObjectSummary, PageResult } from "@xunjianbao/shared";
import { roads } from "../data";
import { ObjectCard } from "../components/ObjectCard";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackRoads: PageResult<ManagedObjectSummary> = {
  items: roads,
  page: 1,
  pageSize: 20,
  total: roads.length,
};

export function RoadsPage() {
  const { data } = useApiResource("/roads", fallbackRoads);

  return (
    <>
      <PageHeader eyebrow="ROAD MANAGEMENT" title="道路街面" actions={<Button type="primary">新增道路</Button>} />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">ROAD ARCHIVES</p>
            <h3>重点道路档案</h3>
          </div>
        </div>
        <div className="card-grid">{data.items.map((item) => <ObjectCard key={item.id} item={item} to={`/roads/${item.id}`} />)}</div>
      </section>
    </>
  );
}
