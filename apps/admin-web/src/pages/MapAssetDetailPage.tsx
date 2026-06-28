import { useMemo } from "react";
import { Button, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Link, useParams } from "react-router-dom";
import type { MapAssetSummary, MapHotAreaSummary, ObjectType, PageResult } from "@xunjianbao/shared";
import { getApiUrl } from "../api/client";
import { mapAssets } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const emptyHotAreas: PageResult<MapHotAreaSummary> = { items: [], page: 1, pageSize: 20, total: 0 };

function fallbackMapAsset(id: string | undefined): MapAssetSummary {
  return mapAssets.find((item) => item.id === id) ?? mapAssets[0];
}

function objectTypeLabel(value: ObjectType) {
  if (value === "community") return "小区";
  if (value === "road") return "道路";
  if (value === "point") return "重点点位";
  return "街道";
}

function objectLink(area: MapHotAreaSummary) {
  if (!area.objectId) return null;
  if (area.objectType === "community") return `/communities/${area.objectId}`;
  if (area.objectType === "road") return `/roads/${area.objectId}`;
  return null;
}

function formatCoordinate(area: MapHotAreaSummary) {
  if (area.x === null || area.x === undefined || area.y === null || area.y === undefined) return "未标定";
  return `${area.x}% / ${area.y}% / ${area.width ?? 0}% / ${area.height ?? 0}%`;
}

function canPreviewImage(mapAsset: MapAssetSummary) {
  return mapAsset.sourceType === "image" && Boolean(mapAsset.fileName);
}

export function MapAssetDetailPage() {
  const { id } = useParams();
  const fallback = useMemo(() => fallbackMapAsset(id), [id]);
  const { data: mapAsset } = useApiResource<MapAssetSummary>(`/map-assets/${id}`, fallback);
  const { data: hotAreas, loading } = useApiResource<PageResult<MapHotAreaSummary>>(`/map-assets/${id}/hot-areas`, emptyHotAreas);

  const columns: ColumnsType<MapHotAreaSummary> = [
    { title: "热区名称", dataIndex: "label" },
    { title: "对象类型", dataIndex: "objectType", render: (value: ObjectType) => objectTypeLabel(value) },
    {
      title: "绑定对象",
      render: (_, record) => {
        const to = objectLink(record);
        if (!record.objectId) return "未绑定";
        return to ? <Link className="text-link compact-link" to={to}>{record.objectId}</Link> : record.objectId;
      },
    },
    { title: "坐标", render: (_, record) => formatCoordinate(record) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="MAP DETAIL"
        title={mapAsset.name}
        actions={<Button href="/map-assets">返回地图列表</Button>}
      />

      <section className="content-section">
        <div className="detail-layout">
          <article className="detail-hero">
            <div className="detail-title">
              <span className={`status ${mapAsset.processStatus === "processed" ? "done" : "pending"}`}>
                {mapAsset.processStatus === "processed" ? "已处理" : "已上传"}
              </span>
              <h4>{mapAsset.mapType}</h4>
              <p>地图文件用于首页街道总览、小区入口和道路热区绑定。TIF 文件后续可继续生成预览图或瓦片。</p>
            </div>
            <div className="detail-kpis">
              <div><span>来源</span><strong>{mapAsset.sourceType === "tiff" ? "TIF" : "图片"}</strong></div>
              <div><span>热区数量</span><strong>{mapAsset.hotAreaCount}</strong></div>
              <div><span>文件大小</span><strong>{mapAsset.fileSize ? `${Math.round(mapAsset.fileSize / 1024)}K` : "-"}</strong></div>
              <div><span>文件</span><strong>{mapAsset.fileName ? "可下载" : "样例"}</strong></div>
            </div>
            {mapAsset.fileName ? <a className="download-link detail-download" href={getApiUrl(`/map-assets/${mapAsset.id}/file`)}>下载地图文件</a> : null}
          </article>

          <aside className="timeline-panel">
            <h4>热区摘要</h4>
            <div className="timeline">
              {hotAreas.items.length ? hotAreas.items.slice(0, 4).map((area) => (
                <div key={area.id}>
                  <time>{objectTypeLabel(area.objectType)}</time>
                  <strong>{area.label}</strong>
                  <span>{formatCoordinate(area)}</span>
                </div>
              )) : <p className="empty-note">暂无热区</p>}
            </div>
          </aside>
        </div>
      </section>

      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">HOT AREA PREVIEW</p>
            <h3>热区预览</h3>
          </div>
        </div>
        <div className={`map-preview-frame ${canPreviewImage(mapAsset) ? "has-image" : ""}`}>
          {canPreviewImage(mapAsset) ? <img className="map-preview-image" src={getApiUrl(`/map-assets/${mapAsset.id}/preview`)} alt={mapAsset.name} /> : null}
          <div className="map-preview-label">{mapAsset.name}</div>
          {!canPreviewImage(mapAsset) && mapAsset.sourceType === "tiff" ? <div className="map-preview-note">TIF 地图已保存，后续可生成 WebP 预览或瓦片。</div> : null}
          {hotAreas.items.map((area) => (
            <div
              className={`hot-area-preview ${area.objectType}`}
              key={area.id}
              style={{
                left: `${area.x ?? 8}%`,
                top: `${area.y ?? 8}%`,
                width: `${area.width ?? 20}%`,
                height: `${area.height ?? 10}%`,
              }}
            >
              <span>{area.label}</span>
              <Tag>{objectTypeLabel(area.objectType)}</Tag>
            </div>
          ))}
        </div>
      </section>

      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">HOT AREA LIST</p>
            <h3>热区绑定列表</h3>
          </div>
        </div>
        <Table rowKey="id" columns={columns} dataSource={hotAreas.items} loading={loading} pagination={false} className="data-table" />
      </section>
    </>
  );
}
