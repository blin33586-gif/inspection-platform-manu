import { useState } from "react";
import { Form, Input, message, Modal, Select } from "antd";
import { useNavigate } from "react-router-dom";
import type { IssueSummary, ManagedObjectSummary, MapAssetSummary, MapHotAreaSummary, ObjectType, PageResult, PointSummary } from "@xunjianbao/shared";
import { deleteJsonApi, patchJsonApi, postJsonApi } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { DashboardTileMap, type MapAreaUpdate, type MapDrawingDraft } from "../components/DashboardTileMap";
import { useApiResource } from "../hooks/useApiResource";
import { communities, points, roads } from "../data";
import { getCurrentProject, getUser } from "../auth/session";
import { canModifyProject } from "../auth/project-access";

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
const fallbackPoints: PageResult<PointSummary> = { items: points, page: 1, pageSize: 20, total: points.length };
const emptyManagedObjects: PageResult<ManagedObjectSummary> = { items: [], page: 1, pageSize: 20, total: 0 };
const emptyPoints: PageResult<PointSummary> = { items: [], page: 1, pageSize: 20, total: 0 };

function objectPath(area: MapHotAreaSummary, mapAssetId: string) {
  if (!area.objectId) return `/map-assets/${mapAssetId}`;
  if (area.objectType === "community") return `/communities/${area.objectId}`;
  if (area.objectType === "road") return `/roads/${area.objectId}`;
  if (area.objectType === "point") return `/points/${area.objectId}`;
  return `/map-assets/${mapAssetId}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const project = getCurrentProject();
  const canModify = canModifyProject(getUser()?.role);
  const [drawingForm] = Form.useForm<{ label?: string; objectType?: ObjectType; objectId?: string }>();
  const [drawing, setDrawing] = useState<MapDrawingDraft | null>(null);
  const [drawingObjectType, setDrawingObjectType] = useState<ObjectType>("community");
  const [savingDrawing, setSavingDrawing] = useState(false);
  const { data: mapData, error, reload } = useApiResource<DashboardMapData>("/dashboard/map", fallbackMapData);
  const communitiesResource = useApiResource<PageResult<ManagedObjectSummary>>("/communities", project?.id === "quyang" ? fallbackCommunities : emptyManagedObjects);
  const roadsResource = useApiResource<PageResult<ManagedObjectSummary>>("/roads", project?.id === "quyang" ? fallbackRoads : emptyManagedObjects);
  const pointsResource = useApiResource<PageResult<PointSummary>>("/points", project?.id === "quyang" ? fallbackPoints : emptyPoints);
  const issueCountByObject = mapData.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.objectName] = (counts[issue.objectName] ?? 0) + 1;
    return counts;
  }, {});

  if (error) return <ApiResourceError error={error} onRetry={reload} />;

  const beginDrawingSave = (nextDrawing: MapDrawingDraft) => {
    const objectType = nextDrawing.shape === "polygon" ? "community" : nextDrawing.shape === "point" ? "point" : "road";
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

  const relatedObjects = drawingObjectType === "community"
    ? communitiesResource.data.items
    : drawingObjectType === "road"
      ? roadsResource.data.items
      : pointsResource.data.items;
  const drawingLabel = drawing?.shape === "polygon" ? "小区名称" : drawing?.shape === "point" ? "重点点位名称" : "道路名称";
  const drawingPlaceholder = drawing?.shape === "polygon" ? "例如：玉田新村" : drawing?.shape === "point" ? "例如：曲阳路重点广告牌" : "例如：曲阳路";
  const drawingTitle = drawing?.shape === "polygon" ? "命名小区区域" : drawing?.shape === "point" ? "命名重点点位" : "命名道路线";

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

  const deleteArea = async (area: MapHotAreaSummary) => {
    try {
      await deleteJsonApi<{ id: string }>(`/map-assets/${mapData.mapAssetId}/hot-areas/${area.id}`);
      message.success(`已删除地图标绘「${area.label}」`);
      reload();
    } catch (deleteError) {
      message.error(deleteError instanceof Error ? deleteError.message : "地图标绘删除失败");
      throw deleteError;
    }
  };

  return (
    <section className="home-landing">
      <div className="home-copy"><h1>{project?.shortName ?? "当前项目"}一览</h1></div>
      <div className="tif-map-stage">
        <DashboardTileMap
          activeTileMap={mapData.activeTileMap}
          hotAreas={mapData.hotAreas}
          issueCountByObject={issueCountByObject}
          fallbackTileUrl={project?.id === "quyang" ? "/maps/quyang-2026-01/{z}/{x}/{y}.png" : undefined}
          onOpenArea={(area) => navigate(objectPath(area, mapData.mapAssetId))}
          onOpenIssues={(status) => navigate(`/issues?status=${status}`)}
          onCreateDrawing={canModify ? beginDrawingSave : undefined}
          onDeleteArea={canModify ? deleteArea : undefined}
          onUpdateArea={canModify ? updateArea : undefined}
        />
      </div>
      <Modal cancelText="取消" confirmLoading={savingDrawing} okText="保存标绘" onCancel={() => setDrawing(null)} onOk={saveDrawing} open={Boolean(drawing)} title={drawingTitle}>
        <Form form={drawingForm} layout="vertical">
          <Form.Item label={drawingLabel} name="label" rules={[{ required: true, message: "请输入标绘名称" }]}>
            <Input placeholder={drawingPlaceholder} />
          </Form.Item>
          <Form.Item label="对象类型" name="objectType" rules={[{ required: true, message: "请选择对象类型" }]}>
            <Select
              onChange={(value: ObjectType) => {
                setDrawingObjectType(value);
                drawingForm.setFieldValue("objectId", undefined);
              }}
              options={[{ label: "小区档案", value: "community" }, { label: "道路档案", value: "road" }, { label: "重点点位档案", value: "point" }]}
            />
          </Form.Item>
          <Form.Item label="关联档案" name="objectId" extra="选择后，首页点击名称可直接跳转至相应档案。">
            <Select allowClear options={relatedObjects.map((item) => ({ label: item.name, value: item.id }))} placeholder="选择已有小区、道路或重点点位档案" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
