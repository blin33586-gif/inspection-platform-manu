import { Button, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MapAssetSummary, PageResult } from "@xunjianbao/shared";
import { mapAssets } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackMapAssets: PageResult<MapAssetSummary> = {
  items: mapAssets,
  page: 1,
  pageSize: 20,
  total: mapAssets.length,
};

const columns: ColumnsType<MapAssetSummary> = [
  { title: "地图名称", dataIndex: "name" },
  { title: "地图类型", dataIndex: "mapType" },
  {
    title: "来源",
    dataIndex: "sourceType",
    render: (value) => <Tag color={value === "tiff" ? "purple" : "blue"}>{value === "tiff" ? "TIF" : "图片"}</Tag>,
  },
  {
    title: "处理状态",
    dataIndex: "processStatus",
    render: (value) => <Tag color={value === "processed" ? "green" : "orange"}>{value === "processed" ? "已处理" : "已上传"}</Tag>,
  },
  { title: "热区", dataIndex: "hotAreaCount" },
];

export function MapAssetsPage() {
  const { data, loading } = useApiResource("/map-assets", fallbackMapAssets);

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

      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">MAP LIST</p>
            <h3>地图文件列表</h3>
          </div>
        </div>
        <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} pagination={false} className="data-table" />
      </section>
    </>
  );
}
