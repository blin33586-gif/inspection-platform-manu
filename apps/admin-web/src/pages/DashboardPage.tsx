import { useState } from "react";
import { Form, Input, message, Modal, Select } from "antd";
import { useNavigate } from "react-router-dom";
import type { IssueSummary, ManagedObjectSummary, MapAssetSummary, MapHotAreaSummary, ObjectType, PageResult } from "@xunjianbao/shared";
import { patchJsonApi, postJsonApi } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { DashboardTileMap, type MapAreaUpdate, type MapDrawingDraft } from "../components/DashboardTileMap";
import { useApiResource } from "../hooks/useApiResource";
import { communities, roads } from "../data";

interface DashboardMapData {
  mapAssetId: string;
  activeTileMap?: MapAssetSummary | null;
  hotAreas: MapHotAreaSummary[];
  issues: IssueSummary[];
}

const fallbackMapData: DashboardMapData = {
  mapAssetId: "map-street-main",
  activeTileMap: null,
  hotAreas: [
    { id: "ha-yutian", label: "玉田新村", objectType: "community", objectId: "c-yutian", x: 17, y: 30, width: 23, height: 18 },
    { id: "ha-quyang", label: "曲阳路", objectType: "road", objectId: "r-quyang", x: 45, y: 48, width: 21, height: 8 },
    { id: "ha-river", label: "河道绿化带", objectType: "point", objectId: "p-river-001", x: 8, y: 77, width: 32, height: 7 },
  ],
  issues: [],
};

const fallbackCommunities: PageResult<ManagedObjectSummary> = { items: communities, page: 1, pageSize: 20, total: communities.length };
const fallbackRoads: PageResult<ManagedObjectSummary> = { items: roads, page: 1, pageSize: 20, total: roads.length };

function objectPath(area: MapHotAreaSummary, mapAssetId: string) {
  if (!area.objectId) return `/map-assets/${mapAssetId}`;
  if (area.objectType === "community") return `/communities/${area.objectId}`;
  if (area.objectType === "road") return `/roads/${area.objectId}`;
  if (area.objectType === "point") return `/points/${area.objectId}`;
  return `/map-assets/${mapAssetId}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [drawingForm] = Form.useForm<{ label?: string; objectType?: ObjectType; objectId?: string }>();
  const [drawing, setDrawing] = useState<MapDrawingDraft | null>(null);
  const [drawingObjectType, setDrawingObjectType] = useState<ObjectType>("community");
  const [savingDrawing, setSavingDrawing] = useState(false);
  const { data: mapData, error, reload } = useApiResource<DashboardMapData>("/dashboard/map", fallbackMapData);
  const communitiesResource = useApiResource<PageResult<ManagedObjectSummary>>("/communities", fallbackCommunities);
  const roadsResource = useApiResource<PageResult<ManagedObjectSummary>>("/roads", fallbackRoads);
  const issueCountByObject = mapData.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.objectName] = (counts[issue.objectName] ?? 0) + 1;
    return counts;
  }, {});

  if (error) return <ApiResourceError error={error} onRetry={reload} />;

  const beginDrawingSave = (nextDrawing: MapDrawingDraft) => {
    const objectType = nextDrawing.shape === "polygon" ? "community" : "road";
    drawingForm.resetFields();
    drawingForm.setFieldsValue({ objectType });
    setDrawingObjectType(objectType);
    setDrawing(nextDrawing);
  };

  const saveDrawing = async () => {
    if (!drawing) return;
    const values = await drawingForm.validateFields();
    setSavingDrawing(true);
    try {
      await postJsonApi<MapHotAreaSummary>(`/map-assets/${mapData.mapAssetId}/hot-areas`, {
        label: values.label,
        objectType: values.objectType,
        objectId: values.objectId,
        polygon: JSON.stringify(drawing),
        color: drawing.color,
      });
      message.success("地图标绘已保存");
      setDrawing(null);
      reload();
    } catch (saveError) {
      message.error(saveError instanceof Error ? saveError.message : "标绘保存失败");
    } finally {
      setSavingDrawing(false);
    }
  };

  const relatedObjects = drawingObjectType === "community" ? communitiesResource.data.items : roadsResource.data.items;

  const updateArea = async (area: MapHotAreaSummary, update: MapAreaUpdate) => {
    try {
      await patchJsonApi<MapHotAreaSummary>(`/map-assets/${mapData.mapAssetId}/hot-areas/${area.id}`, update);
      message.success("地图标绘已更新");
      reload();
    } catch (updateError) {
      message.error(updateError instanceof Error ? updateError.message : "标绘更新失败");
      throw updateError;
    }
  };

  return (
    <section className="home-landing">
      <div className="home-copy"><h1>曲阳街道一览</h1></div>
      <div className="tif-map-stage">
        <DashboardTileMap
          activeTileMap={mapData.activeTileMap}
          hotAreas={mapData.hotAreas}
          issueCountByObject={issueCountByObject}
          onOpenArea={(area) => navigate(objectPath(area, mapData.mapAssetId))}
          onOpenIssues={(status) => navigate(`/issues?status=${status}`)}
          onCreateDrawing={beginDrawingSave}
          onUpdateArea={updateArea}
        />
      </div>
      <Modal cancelText="取消" confirmLoading={savingDrawing} okText="保存标绘" onCancel={() => setDrawing(null)} onOk={saveDrawing} open={Boolean(drawing)} title={drawing?.shape === "polygon" ? "命名小区区域" : "命名道路线"}>
        <Form form={drawingForm} layout="vertical">
          <Form.Item label="地图名称" name="label" rules={[{ required: true, message: "请输入小区或道路名称" }]}>
            <Input placeholder={drawing?.shape === "polygon" ? "例如：玉田新村" : "例如：曲阳路"} />
          </Form.Item>
          <Form.Item label="对象类型" name="objectType" rules={[{ required: true, message: "请选择对象类型" }]}>
            <Select
              onChange={(value: ObjectType) => {
                setDrawingObjectType(value);
                drawingForm.setFieldValue("objectId", undefined);
              }}
              options={[{ label: "小区档案", value: "community" }, { label: "道路档案", value: "road" }]}
            />
          </Form.Item>
          <Form.Item label="关联档案" name="objectId" extra="选择后，首页点击名称可直接跳转至相应档案。">
            <Select allowClear options={relatedObjects.map((item) => ({ label: item.name, value: item.id }))} placeholder="选择已有小区或道路档案" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
