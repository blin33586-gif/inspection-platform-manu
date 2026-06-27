import { Button } from "antd";
import { roads } from "../data";
import { ObjectCard } from "../components/ObjectCard";
import { PageHeader } from "../components/PageHeader";

export function RoadsPage() {
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
        <div className="card-grid">{roads.map((item) => <ObjectCard key={item.id} item={item} />)}</div>
      </section>
    </>
  );
}
