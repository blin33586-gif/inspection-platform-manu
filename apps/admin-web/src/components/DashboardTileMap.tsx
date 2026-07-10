import { useMemo, useState } from "react";
import { Button } from "antd";
import { Check, Pencil, PencilLine, Save, Trash2, Undo2, X } from "lucide-react";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Rectangle, TileLayer, Tooltip, useMapEvents, ZoomControl } from "react-leaflet";
import { divIcon } from "leaflet";
import type { LatLngBoundsExpression, LatLngTuple, PathOptions } from "leaflet";
import type { MapAssetSummary, MapHotAreaSummary } from "@xunjianbao/shared";
import { getApiUrl } from "../api/client";
import "leaflet/dist/leaflet.css";

export interface MapDrawingDraft {
  shape: "line" | "polygon";
  coordinates: LatLngTuple[];
}

export interface MapAreaUpdate {
  label: string;
  polygon: string;
}

interface DashboardTileMapProps {
  activeTileMap?: MapAssetSummary | null;
  hotAreas: MapHotAreaSummary[];
  issueCountByObject: Record<string, number>;
  onOpenArea: (area: MapHotAreaSummary) => void;
  onOpenIssues: (status: "pending" | "processing" | "verified") => void;
  onCreateDrawing: (drawing: MapDrawingDraft) => void;
  onUpdateArea: (area: MapHotAreaSummary, update: MapAreaUpdate) => Promise<void>;
}

type MapMode = "idle" | "line" | "polygon" | "edit";

const fallbackBounds: LatLngBoundsExpression = [
  [31.276496883214108, 121.47531509399414],
  [31.297621354424027, 121.49969100952148],
];

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

const labelAnchorIcon = divIcon({
  className: "map-label-anchor-icon",
  html: "",
  iconSize: [1, 1],
  iconAnchor: [0, 0],
});

function objectTypeLabel(area: MapHotAreaSummary) {
  if (area.objectType === "community") return "小区";
  if (area.objectType === "road") return "道路";
  if (area.objectType === "point") return "点位";
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

function areaStyle(type: MapHotAreaSummary["objectType"]): PathOptions {
  if (type === "road") return { color: "#0a65d8", fillColor: "#1d6fff", fillOpacity: 0.1, weight: 4 };
  if (type === "point") return { color: "#0c9f90", fillColor: "#29c7e8", fillOpacity: 0.16, weight: 2 };
  return { color: "#4b83ff", fillColor: "#4b83ff", fillOpacity: 0.14, weight: 2 };
}

function parseAreaGeometry(area: MapHotAreaSummary): MapDrawingDraft | null {
  if (!area.polygon) return null;
  try {
    const parsed = JSON.parse(area.polygon) as { shape?: unknown; coordinates?: unknown };
    if ((parsed.shape !== "line" && parsed.shape !== "polygon") || !Array.isArray(parsed.coordinates)) return null;
    const coordinates = parsed.coordinates.filter((point): point is [number, number] => (
      Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
    ));
    return coordinates.length ? { shape: parsed.shape, coordinates } : null;
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
  };
}

function geometryCenter(geometry: MapDrawingDraft): LatLngTuple {
  const [latitude, longitude] = geometry.coordinates.reduce<[number, number]>((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0]);
  return [latitude / geometry.coordinates.length, longitude / geometry.coordinates.length];
}

function DrawingLayer({ drawingMode, points, onAddPoint, onClosePolygon }: { drawingMode: "idle" | "line" | "polygon"; points: LatLngTuple[]; onAddPoint: (point: LatLngTuple) => void; onClosePolygon: () => void }) {
  useMapEvents({ click(event) { if (drawingMode !== "idle") onAddPoint([event.latlng.lat, event.latlng.lng]); } });
  if (!points.length) return null;
  const pathOptions: PathOptions = { color: "#0071e3", fillColor: "#0071e3", fillOpacity: 0.14, dashArray: "6 6", weight: 3 };
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

function EditableAreaLayer({ drawing, label, onLabelChange, onMoveVertex }: { drawing: MapDrawingDraft; label: string; onLabelChange: (value: string) => void; onMoveVertex: (index: number, position: LatLngTuple) => void }) {
  const pathOptions: PathOptions = { color: "#0071e3", fillColor: "#0071e3", fillOpacity: 0.1, dashArray: "5 5", weight: 3 };
  const center = geometryCenter(drawing);
  return (
    <>
      {drawing.shape === "polygon" ? <Polygon positions={drawing.coordinates} pathOptions={pathOptions} /> : <Polyline positions={drawing.coordinates} pathOptions={pathOptions} />}
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
          title="拖动调整边界"
        />
      ))}
      <Marker icon={labelAnchorIcon} position={center}>
        <Tooltip className="dashboard-map-label editable" direction="center" interactive opacity={1} permanent>
          <input aria-label="编辑区域名称" onChange={(event) => onLabelChange(event.target.value)} onClick={(event) => event.stopPropagation()} value={label} />
          <span>拖动蓝色节点调整范围</span>
        </Tooltip>
      </Marker>
    </>
  );
}

export function DashboardTileMap({ activeTileMap, hotAreas, issueCountByObject, onOpenArea, onOpenIssues, onCreateDrawing, onUpdateArea }: DashboardTileMapProps) {
  const [mode, setMode] = useState<MapMode>("idle");
  const [drawingPoints, setDrawingPoints] = useState<LatLngTuple[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedDrawing, setSelectedDrawing] = useState<MapDrawingDraft | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [savingArea, setSavingArea] = useState(false);
  const tileMetadata = activeTileMap?.tileMetadata;
  const mapBounds = tileMetadata?.bounds ?? { west: 121.47531509399414, east: 121.49969100952148, north: 31.297621354424027, south: 31.276496883214108 };
  const bounds: LatLngBoundsExpression = tileMetadata ? [[mapBounds.south, mapBounds.west], [mapBounds.north, mapBounds.east]] : fallbackBounds;
  const tileUrl = activeTileMap?.id ? decodeURIComponent(getApiUrl(`/map-assets/${activeTileMap.id}/tiles/{z}/{x}/{y}`)) : "/maps/quyang-2026-01/{z}/{x}/{y}.png";
  const center = useMemo<LatLngTuple>(() => [(mapBounds.north + mapBounds.south) / 2, (mapBounds.west + mapBounds.east) / 2], [mapBounds.east, mapBounds.north, mapBounds.south, mapBounds.west]);
  const drawingMode = mode === "line" || mode === "polygon" ? mode : "idle";
  const minimumPoints = drawingMode === "polygon" ? 3 : 2;
  const editMode = mode === "edit";
  const selectedArea = hotAreas.find((area) => area.id === selectedAreaId) ?? null;

  const startDrawing = (nextMode: "line" | "polygon") => {
    setMode(nextMode);
    setDrawingPoints([]);
    setSelectedAreaId(null);
    setSelectedDrawing(null);
  };

  const appendDrawingPoint = (point: LatLngTuple) => {
    setDrawingPoints((points) => [...points, point]);
  };

  const finishDrawing = () => {
    if (drawingMode === "idle" || drawingPoints.length < minimumPoints) return;
    onCreateDrawing({ shape: drawingMode, coordinates: drawingPoints });
    setMode("idle");
    setDrawingPoints([]);
  };

  const selectAreaForEdit = (area: MapHotAreaSummary) => {
    setSelectedAreaId(area.id);
    setSelectedDrawing(editableGeometry(area, mapBounds));
    setSelectedLabel(area.label);
  };

  const cancelEdit = () => {
    setMode("idle");
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

  return (
    <div className="dashboard-tile-map">
      <div className="dashboard-map-draw-tools" aria-label="地图标绘工具">
        <Button aria-label="画道路线" className={mode === "line" ? "is-active" : ""} icon={<PencilLine size={16} />} onClick={() => startDrawing("line")} title="画道路线">画道路</Button>
        <Button aria-label="圈选小区" className={mode === "polygon" ? "is-active" : ""} icon={<PencilLine size={16} />} onClick={() => startDrawing("polygon")} title="圈选小区">圈小区</Button>
        <Button aria-label="编辑标绘" className={editMode ? "is-active" : ""} icon={<Pencil size={16} />} onClick={() => { setMode("edit"); setDrawingPoints([]); }} title="编辑已有标绘">编辑</Button>
        {editMode ? (
          <>
            <Button aria-label="保存区域修改" disabled={!selectedArea || !selectedDrawing || !selectedLabel.trim()} icon={<Save size={16} />} loading={savingArea} onClick={saveEdit} title="保存区域修改">保存</Button>
            <Button aria-label="取消区域修改" icon={<X size={16} />} onClick={cancelEdit} title="取消区域修改" />
          </>
        ) : (
          <>
            <Button aria-label="撤销一个落点" disabled={drawingPoints.length === 0} icon={<Undo2 size={16} />} onClick={() => setDrawingPoints((points) => points.slice(0, -1))} title="撤销一个落点" />
            <Button aria-label="清空标绘" disabled={drawingPoints.length === 0} icon={<Trash2 size={16} />} onClick={() => setDrawingPoints([])} title="清空标绘" />
            <Button aria-label="完成并命名" disabled={drawingMode === "idle" || drawingPoints.length < minimumPoints} icon={<Check size={16} />} onClick={finishDrawing} title="完成并命名">完成</Button>
          </>
        )}
      </div>
      <MapContainer attributionControl={false} bounds={bounds} center={center} key={activeTileMap?.id ?? "quyang-static-map"} maxBounds={bounds} maxBoundsViscosity={1} maxZoom={tileMetadata?.maxZoom ?? 18} minZoom={tileMetadata?.minZoom ?? 16} scrollWheelZoom zoom={Math.min(tileMetadata?.maxZoom ?? 18, Math.max(tileMetadata?.minZoom ?? 16, 17))} zoomControl={false}>
        <ZoomControl position="bottomright" />
        <TileLayer bounds={bounds} keepBuffer={1} maxNativeZoom={tileMetadata?.maxZoom ?? 18} minNativeZoom={tileMetadata?.minZoom ?? 16} noWrap tileSize={256} updateWhenIdle url={tileUrl} />
        <DrawingLayer drawingMode={drawingMode} points={drawingPoints} onAddPoint={appendDrawingPoint} onClosePolygon={finishDrawing} />
        {hotAreas.map((area) => {
          const issueCount = issueCountByObject[area.label] ?? 0;
          const geometry = parseAreaGeometry(area);
          const isSelected = editMode && area.id === selectedAreaId;
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
          };
          const tooltip = isSelected ? null : <Tooltip className={`dashboard-map-label ${area.objectType}`} direction="center" opacity={1} permanent><strong>{area.label}</strong><span>{objectTypeLabel(area)} / 问题 {issueCount}</span></Tooltip>;
          if (geometry?.shape === "line") return <Polyline eventHandlers={eventHandlers} key={area.id} pathOptions={areaStyle(area.objectType)} positions={geometry.coordinates}>{tooltip}</Polyline>;
          if (geometry?.shape === "polygon") return <Polygon eventHandlers={eventHandlers} key={area.id} pathOptions={areaStyle(area.objectType)} positions={geometry.coordinates}>{tooltip}</Polygon>;
          return <Rectangle bounds={areaBounds(area, mapBounds)} eventHandlers={eventHandlers} key={area.id} pathOptions={areaStyle(area.objectType)}>{tooltip}</Rectangle>;
        })}
        {editMode && selectedDrawing ? <EditableAreaLayer drawing={selectedDrawing} label={selectedLabel} onLabelChange={setSelectedLabel} onMoveVertex={updateVertex} /> : null}
        <CircleMarker center={[31.2875, 121.4868]} eventHandlers={{ click: () => onOpenIssues("pending") }} pathOptions={{ color: "#e74747", fillColor: "#e74747", fillOpacity: 0.95 }} radius={8}><Tooltip direction="top">待处理问题</Tooltip></CircleMarker>
        <CircleMarker center={[31.2839, 121.491]} eventHandlers={{ click: () => onOpenIssues("processing") }} pathOptions={{ color: "#f59a23", fillColor: "#f59a23", fillOpacity: 0.95 }} radius={8}><Tooltip direction="top">处理中问题</Tooltip></CircleMarker>
        <CircleMarker center={[31.2805, 121.4842]} eventHandlers={{ click: () => onOpenIssues("verified") }} pathOptions={{ color: "#20a66a", fillColor: "#20a66a", fillOpacity: 0.95 }} radius={8}><Tooltip direction="top">复查通过问题</Tooltip></CircleMarker>
      </MapContainer>
    </div>
  );
}
