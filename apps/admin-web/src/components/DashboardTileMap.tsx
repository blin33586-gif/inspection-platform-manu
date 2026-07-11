import { useMemo, useState } from "react";
import { Button, Input, Modal } from "antd";
import { Check, Layers3, MapPin, Pencil, PencilLine, Save, Trash2, Undo2, X } from "lucide-react";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Rectangle, TileLayer, Tooltip, useMapEvents, ZoomControl } from "react-leaflet";
import { divIcon } from "leaflet";
import type { LatLngBoundsExpression, LatLngTuple, PathOptions } from "leaflet";
import { MAP_HOT_AREA_COLOR_OPTIONS, type MapAssetSummary, type MapHotAreaColor, type MapHotAreaSummary } from "@xunjianbao/shared";
import { getApiUrl } from "../api/client";
import "leaflet/dist/leaflet.css";

export interface MapDrawingDraft {
  shape: "line" | "polygon" | "point";
  coordinates: LatLngTuple[];
  color: MapHotAreaColor;
}

export interface MapAreaUpdate {
  label: string;
  polygon: string;
  color: MapHotAreaColor;
}

interface DashboardTileMapProps {
  activeTileMap?: MapAssetSummary | null;
  hotAreas: MapHotAreaSummary[];
  issueCountByObject: Record<string, number>;
  onOpenArea: (area: MapHotAreaSummary) => void;
  onOpenIssues: (status: "pending" | "processing" | "verified") => void;
  onCreateDrawing: (drawing: MapDrawingDraft) => void;
  onDeleteArea: (area: MapHotAreaSummary) => Promise<void>;
  onUpdateArea: (area: MapHotAreaSummary, update: MapAreaUpdate) => Promise<void>;
}

type MapMode = "idle" | "line" | "polygon" | "point" | "edit";

const fallbackBounds: LatLngBoundsExpression = [
  [31.276496883214108, 121.47531509399414],
  [31.297621354424027, 121.49969100952148],
];

const defaultMapAreaColor: MapHotAreaColor = MAP_HOT_AREA_COLOR_OPTIONS[0].value;
const defaultColorByObjectType: Record<MapHotAreaSummary["objectType"], MapHotAreaColor> = {
  community: "#1677ff",
  road: "#13c2c2",
  point: "#52c41a",
  street: "#722ed1",
};

const finishDrawingIcon = divIcon({
  className: "map-drawing-finish-icon",
  html: "<span>✓</span>",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const vertexHandleIcon = divIcon({
  className: "map-edit-vertex-icon",
  html: "<span></span>",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function objectTypeLabel(area: MapHotAreaSummary) {
  if (area.objectType === "community") return "小区";
  if (area.objectType === "road") return "道路";
  if (area.objectType === "point") return "重点点位";
  return "街道";
}

function areaBounds(area: MapHotAreaSummary, bounds: { west: number; east: number; north: number; south: number }): LatLngBoundsExpression {
  const left = area.x ?? 10;
  const top = area.y ?? 10;
  const width = area.width ?? 20;
  const height = area.height ?? 10;
  const longitude = (value: number) => bounds.west + ((bounds.east - bounds.west) * value) / 100;
  const latitude = (value: number) => bounds.north - ((bounds.north - bounds.south) * value) / 100;
  return [[latitude(top + height), longitude(left)], [latitude(top), longitude(left + width)]];
}

function areaColor(area: MapHotAreaSummary): MapHotAreaColor {
  return area.color ?? defaultColorByObjectType[area.objectType];
}

function areaStyle(area: MapHotAreaSummary): PathOptions {
  const color = areaColor(area);
  if (area.objectType === "road") return { color, fillColor: color, fillOpacity: 0.1, weight: 4 };
  if (area.objectType === "point") return { color, fillColor: color, fillOpacity: 0.16, weight: 2 };
  return { color, fillColor: color, fillOpacity: 0.14, weight: 2 };
}

function parseAreaGeometry(area: MapHotAreaSummary): MapDrawingDraft | null {
  if (!area.polygon) return null;
  try {
    const parsed = JSON.parse(area.polygon) as { shape?: unknown; coordinates?: unknown };
    if ((parsed.shape !== "line" && parsed.shape !== "polygon" && parsed.shape !== "point") || !Array.isArray(parsed.coordinates)) return null;
    const coordinates = parsed.coordinates.filter((point): point is [number, number] => (
      Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
    ));
    return coordinates.length ? { shape: parsed.shape, coordinates, color: areaColor(area) } : null;
  } catch {
    return null;
  }
}

function editableGeometry(area: MapHotAreaSummary, bounds: { west: number; east: number; north: number; south: number }): MapDrawingDraft {
  const geometry = parseAreaGeometry(area);
  if (geometry) return geometry;
  const [[south, west], [north, east]] = areaBounds(area, bounds) as [[number, number], [number, number]];
  return {
    shape: "polygon",
    coordinates: [[north, west], [north, east], [south, east], [south, west]],
    color: areaColor(area),
  };
}

function DrawingLayer({ color, drawingMode, points, onAddPoint, onClosePolygon }: { color: MapHotAreaColor; drawingMode: "idle" | "line" | "polygon" | "point"; points: LatLngTuple[]; onAddPoint: (point: LatLngTuple) => void; onClosePolygon: () => void }) {
  useMapEvents({ click(event) { if (drawingMode !== "idle") onAddPoint([event.latlng.lat, event.latlng.lng]); } });
  if (!points.length) return null;
  if (drawingMode === "point") {
    return <CircleMarker center={points[0]} pathOptions={{ color: "#ffffff", fillColor: color, fillOpacity: 1, weight: 3 }} radius={9} />;
  }
  const pathOptions: PathOptions = { color, fillColor: color, fillOpacity: 0.14, dashArray: "6 6", weight: 3 };
  const canClosePolygon = drawingMode === "polygon" && points.length >= 3;
  return (
    <>
      {canClosePolygon ? <Polygon positions={points} pathOptions={pathOptions} /> : <Polyline positions={points} pathOptions={pathOptions} />}
      {points.map((point, index) => <CircleMarker center={point} key={`${point[0]}-${point[1]}-${index}`} pathOptions={{ color: "#ffffff", fillColor: "#0071e3", fillOpacity: 1, weight: 2 }} radius={5} />)}
      {canClosePolygon ? (
        <Marker
          eventHandlers={{ click: (event) => { event.originalEvent.stopPropagation(); onClosePolygon(); } }}
          icon={finishDrawingIcon}
          position={points[points.length - 1]}
          title="点击闭合并命名小区"
        >
          <Tooltip direction="top" offset={[0, -16]}>闭合区域</Tooltip>
        </Marker>
      ) : null}
    </>
  );
}

function EditableAreaLayer({ color, drawing, onMoveVertex }: { color: MapHotAreaColor; drawing: MapDrawingDraft; onMoveVertex: (index: number, position: LatLngTuple) => void }) {
  const pathOptions: PathOptions = { color, fillColor: color, fillOpacity: 0.1, dashArray: "5 5", weight: 3 };
  return (
    <>
      {drawing.shape === "polygon" ? <Polygon positions={drawing.coordinates} pathOptions={pathOptions} /> : drawing.shape === "line" ? <Polyline positions={drawing.coordinates} pathOptions={pathOptions} /> : <CircleMarker center={drawing.coordinates[0]} pathOptions={pathOptions} radius={11} />}
      {drawing.coordinates.map((point, index) => (
        <Marker
          draggable
          eventHandlers={{
            dragend: (event) => {
              const marker = event.target as { getLatLng: () => { lat: number; lng: number } };
              const position = marker.getLatLng();
              onMoveVertex(index, [position.lat, position.lng]);
            },
          }}
          icon={vertexHandleIcon}
          key={`${index}-${point[0]}-${point[1]}`}
          position={point}
          title={drawing.shape === "point" ? "拖动调整点位" : "拖动调整边界"}
        />
      ))}
    </>
  );
}

function MapColorPicker({ color, onChange }: { color: MapHotAreaColor; onChange: (nextColor: MapHotAreaColor) => void }) {
  return (
    <div aria-label="选择标绘边框颜色" className="map-color-picker">
      {MAP_HOT_AREA_COLOR_OPTIONS.map((option) => (
        <button
          aria-label={`选择${option.label}边框`}
          aria-pressed={color === option.value}
          className={color === option.value ? "is-selected" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          title={`选择${option.label}边框`}
          type="button"
        >
          <span style={{ backgroundColor: option.value }} />
        </button>
      ))}
    </div>
  );
}

export function DashboardTileMap({ activeTileMap, hotAreas, issueCountByObject, onOpenArea, onOpenIssues, onCreateDrawing, onDeleteArea, onUpdateArea }: DashboardTileMapProps) {
  const [mode, setMode] = useState<MapMode>("idle");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<LatLngTuple[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedDrawing, setSelectedDrawing] = useState<MapDrawingDraft | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [selectedColor, setSelectedColor] = useState<MapHotAreaColor>(defaultMapAreaColor);
  const [hoveredAreaId, setHoveredAreaId] = useState<string | null>(null);
  const [savingArea, setSavingArea] = useState(false);
  const tileMetadata = activeTileMap?.tileMetadata;
  const mapBounds = tileMetadata?.bounds ?? { west: 121.47531509399414, east: 121.49969100952148, north: 31.297621354424027, south: 31.276496883214108 };
  const bounds: LatLngBoundsExpression = tileMetadata ? [[mapBounds.south, mapBounds.west], [mapBounds.north, mapBounds.east]] : fallbackBounds;
  const tileUrl = activeTileMap?.id ? decodeURIComponent(getApiUrl(`/map-assets/${activeTileMap.id}/tiles/{z}/{x}/{y}`)) : "/maps/quyang-2026-01/{z}/{x}/{y}.png";
  const center = useMemo<LatLngTuple>(() => [(mapBounds.north + mapBounds.south) / 2, (mapBounds.west + mapBounds.east) / 2], [mapBounds.east, mapBounds.north, mapBounds.south, mapBounds.west]);
  const drawingMode = mode === "line" || mode === "polygon" || mode === "point" ? mode : "idle";
  const minimumPoints = drawingMode === "polygon" ? 3 : drawingMode === "line" ? 2 : 1;
  const editMode = mode === "edit";
  const selectedArea = hotAreas.find((area) => area.id === selectedAreaId) ?? null;

  const startDrawing = (nextMode: "line" | "polygon" | "point") => {
    setToolsOpen(true);
    setMode(nextMode);
    setDrawingPoints([]);
    setSelectedAreaId(null);
    setSelectedDrawing(null);
    setHoveredAreaId(null);
    if (nextMode === "point") setSelectedColor("#f5222d");
  };

  const appendDrawingPoint = (point: LatLngTuple) => {
    if (drawingMode === "point") {
      onCreateDrawing({ shape: "point", coordinates: [point], color: selectedColor });
      setMode("idle");
      setDrawingPoints([]);
      return;
    }
    setDrawingPoints((points) => [...points, point]);
  };

  const finishDrawing = () => {
    if (drawingMode === "idle" || drawingPoints.length < minimumPoints) return;
    onCreateDrawing({ shape: drawingMode, coordinates: drawingPoints, color: selectedColor });
    setMode("idle");
    setDrawingPoints([]);
  };

  const selectAreaForEdit = (area: MapHotAreaSummary) => {
    setSelectedAreaId(area.id);
    setSelectedDrawing(editableGeometry(area, mapBounds));
    setSelectedLabel(area.label);
    setSelectedColor(areaColor(area));
  };

  const cancelEdit = () => {
    setMode("idle");
    setSelectedAreaId(null);
    setSelectedDrawing(null);
    setSelectedLabel("");
    setHoveredAreaId(null);
  };

  const closeTools = () => {
    setToolsOpen(false);
    setMode("idle");
    setDrawingPoints([]);
    setSelectedAreaId(null);
    setSelectedDrawing(null);
    setSelectedLabel("");
  };

  const saveEdit = async () => {
    if (!selectedArea || !selectedDrawing || !selectedLabel.trim()) return;
    setSavingArea(true);
    try {
      await onUpdateArea(selectedArea, {
        label: selectedLabel.trim(),
        polygon: JSON.stringify(selectedDrawing),
        color: selectedColor,
      });
      cancelEdit();
    } finally {
      setSavingArea(false);
    }
  };

  const updateVertex = (index: number, position: LatLngTuple) => {
    setSelectedDrawing((current) => current ? {
      ...current,
      coordinates: current.coordinates.map((point, pointIndex) => pointIndex === index ? position : point),
    } : current);
  };

  const deleteSelectedArea = () => {
    if (!selectedArea) return;
    Modal.confirm({
      title: `删除「${selectedArea.label}」标绘？`,
      content: "删除后将不能通过地图跳转到该区域；关联的小区或道路档案不会被删除。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        setSavingArea(true);
        try {
          await onDeleteArea(selectedArea);
          closeTools();
        } finally {
          setSavingArea(false);
        }
      },
    });
  };

  return (
    <div className="dashboard-tile-map">
      <div className={`dashboard-map-draw-tools ${toolsOpen ? "is-open" : ""}`} aria-label="地图标绘工具">
        <Button aria-expanded={toolsOpen} aria-label="打开地图标绘工具" className="map-tools-toggle" icon={<Layers3 size={20} />} onClick={() => setToolsOpen(true)} shape="circle" title="地图标绘工具" />
        <div aria-hidden={!toolsOpen} className="map-draw-tools-panel">
          <Button aria-label="画道路线" className={mode === "line" ? "is-active" : ""} icon={<PencilLine size={16} />} onClick={() => startDrawing("line")} title="画道路线">画道路</Button>
          <Button aria-label="圈选小区" className={mode === "polygon" ? "is-active" : ""} icon={<PencilLine size={16} />} onClick={() => startDrawing("polygon")} title="圈选小区">圈小区</Button>
          <Button aria-label="绘制重点点位" className={mode === "point" ? "is-active" : ""} icon={<MapPin size={16} />} onClick={() => startDrawing("point")} title="绘制重点点位">画点位</Button>
          <Button aria-label="编辑标绘" className={editMode ? "is-active" : ""} icon={<Pencil size={16} />} onClick={() => { setToolsOpen(true); setMode("edit"); setDrawingPoints([]); setHoveredAreaId(null); }} title="编辑已有标绘">编辑</Button>
          <MapColorPicker color={selectedColor} onChange={setSelectedColor} />
          {editMode ? (
            <>
              {selectedArea ? <Input aria-label="编辑区域名称" className="map-edit-label-input" onChange={(event) => setSelectedLabel(event.target.value)} placeholder="标绘名称" value={selectedLabel} /> : null}
              <Button aria-label="保存区域修改" disabled={!selectedArea || !selectedDrawing || !selectedLabel.trim()} icon={<Save size={16} />} loading={savingArea} onClick={saveEdit} title="保存区域修改">保存</Button>
              <Button aria-label="删除已选区域" danger disabled={!selectedArea || savingArea} icon={<Trash2 size={16} />} onClick={deleteSelectedArea} title="删除已选区域">删除</Button>
            </>
          ) : (
            <>
              <Button aria-label="撤销一个落点" disabled={drawingPoints.length === 0} icon={<Undo2 size={16} />} onClick={() => setDrawingPoints((points) => points.slice(0, -1))} title="撤销一个落点" />
              <Button aria-label="清空标绘" disabled={drawingPoints.length === 0} icon={<Trash2 size={16} />} onClick={() => setDrawingPoints([])} title="清空标绘" />
              <Button aria-label="完成并命名" disabled={drawingMode === "idle" || drawingPoints.length < minimumPoints} icon={<Check size={16} />} onClick={finishDrawing} title="完成并命名">完成</Button>
            </>
          )}
          <Button aria-label="收起地图标绘工具" icon={<X size={16} />} onClick={closeTools} title="收起地图标绘工具" />
        </div>
      </div>
      <MapContainer attributionControl={false} bounds={bounds} center={center} key={activeTileMap?.id ?? "quyang-static-map"} maxBounds={bounds} maxBoundsViscosity={1} maxZoom={tileMetadata?.maxZoom ?? 18} minZoom={tileMetadata?.minZoom ?? 16} scrollWheelZoom zoom={Math.min(tileMetadata?.maxZoom ?? 18, Math.max(tileMetadata?.minZoom ?? 16, 17))} zoomControl={false}>
        <ZoomControl position="bottomright" />
        <TileLayer bounds={bounds} keepBuffer={1} maxNativeZoom={tileMetadata?.maxZoom ?? 18} minNativeZoom={tileMetadata?.minZoom ?? 16} noWrap tileSize={256} updateWhenIdle url={tileUrl} />
        <DrawingLayer color={selectedColor} drawingMode={drawingMode} points={drawingPoints} onAddPoint={appendDrawingPoint} onClosePolygon={finishDrawing} />
        {hotAreas.map((area) => {
          const issueCount = issueCountByObject[area.label] ?? 0;
          const geometry = parseAreaGeometry(area);
          const eventHandlers = {
            click: (event: { originalEvent: { stopPropagation: () => void }; latlng: { lat: number; lng: number } }) => {
              if (editMode) {
                event.originalEvent.stopPropagation();
                selectAreaForEdit(area);
              } else if (drawingMode !== "idle") {
                event.originalEvent.stopPropagation();
                appendDrawingPoint([event.latlng.lat, event.latlng.lng]);
              } else {
                onOpenArea(area);
              }
            },
            mouseover: () => {
              if (!editMode) setHoveredAreaId(area.id);
            },
            mouseout: () => {
              setHoveredAreaId((current) => current === area.id ? null : current);
            },
          };
          const tooltip = !editMode && hoveredAreaId === area.id ? <Tooltip className={`dashboard-map-label ${area.objectType}`} direction="center" opacity={1} permanent><strong>{area.label}</strong><span>{objectTypeLabel(area)} / 问题 {issueCount}</span></Tooltip> : null;
          if (geometry?.shape === "line") return <Polyline eventHandlers={eventHandlers} key={area.id} pathOptions={areaStyle(area)} positions={geometry.coordinates}>{tooltip}</Polyline>;
          if (geometry?.shape === "polygon") return <Polygon eventHandlers={eventHandlers} key={area.id} pathOptions={areaStyle(area)} positions={geometry.coordinates}>{tooltip}</Polygon>;
          if (geometry?.shape === "point") return <CircleMarker center={geometry.coordinates[0]} eventHandlers={eventHandlers} key={area.id} pathOptions={areaStyle(area)} radius={9}>{tooltip}</CircleMarker>;
          return <Rectangle bounds={areaBounds(area, mapBounds)} eventHandlers={eventHandlers} key={area.id} pathOptions={areaStyle(area)}>{tooltip}</Rectangle>;
        })}
        {editMode && selectedDrawing ? <EditableAreaLayer color={selectedColor} drawing={selectedDrawing} onMoveVertex={updateVertex} /> : null}
        <CircleMarker center={[31.2875, 121.4868]} eventHandlers={{ click: () => onOpenIssues("pending") }} pathOptions={{ color: "#e74747", fillColor: "#e74747", fillOpacity: 0.95 }} radius={8}><Tooltip direction="top">待处理问题</Tooltip></CircleMarker>
        <CircleMarker center={[31.2839, 121.491]} eventHandlers={{ click: () => onOpenIssues("processing") }} pathOptions={{ color: "#f59a23", fillColor: "#f59a23", fillOpacity: 0.95 }} radius={8}><Tooltip direction="top">处理中问题</Tooltip></CircleMarker>
        <CircleMarker center={[31.2805, 121.4842]} eventHandlers={{ click: () => onOpenIssues("verified") }} pathOptions={{ color: "#20a66a", fillColor: "#20a66a", fillOpacity: 0.95 }} radius={8}><Tooltip direction="top">复查通过问题</Tooltip></CircleMarker>
      </MapContainer>
    </div>
  );
}
