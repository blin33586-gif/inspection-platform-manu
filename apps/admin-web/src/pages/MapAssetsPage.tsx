import { Button } from "antd";
import { PageHeader } from "../components/PageHeader";

export function MapAssetsPage() {
  return (
    <>
      <PageHeader eyebrow="MAP ASSETS" title="地图资产" actions={<Button type="primary">上传地图</Button>} />
      <section className="content-section map-assets">
        <div className="section-head">
          <div>
            <p className="eyebrow">TIF WORKFLOW</p>
            <h3>TIF 地图处理流程</h3>
          </div>
        </div>
        <div className="pipeline">
          <div><strong>1</strong><span>上传 TIF / 照片地图</span></div>
          <div><strong>2</strong><span>生成 WebP 预览或瓦片</span></div>
          <div><strong>3</strong><span>绘制小区和道路热区</span></div>
          <div><strong>4</strong><span>绑定档案并在首页点击进入</span></div>
        </div>
      </section>
    </>
  );
}
