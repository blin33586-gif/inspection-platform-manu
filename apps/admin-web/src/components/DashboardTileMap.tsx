import { CircleMarker, MapContainer, Rectangle, TileLayer, Tooltip, ZoomControl } from "react-leaflet";
import type { LatLngBoundsExpression, PathOptions } from "leaflet";
import type { MapHotAreaSummary } from "@xunjianbao/shared";
import "leaflet/dist/leaflet.css";

interface DashboardTileMapProps {
  hotAreas: MapHotAreaSummary[];
  issueCountByObject: Record<string, number>;
  onOpenArea: (area: MapHotAreaSummary) => void;
  onOpenIssues: (status: "pending" | "processing" | "verified") => void;
}

const quyangBounds: LatLngBoundsExpression = [
  [31.276496883214108, 121.47531509399414],
  [31.297621354424027, 121.49969100952148],
];

const mapWest = 121.47531509399414;
const mapEast = 121.49969100952148;
const mapNorth = 31.297621354424027;
const mapSouth = 31.276496883214108;

function objectTypeLabel(area: MapHotAreaSummary) {
  if (area.objectType === "community") return "小区";
  if (area.objectType === "road") return "道路";
  if (area.objectType === "point") return "点位";
  return "街道";
}

function areaBounds(area: MapHotAreaSummary): LatLngBoundsExpression {
  const left = area.x ?? 10;
  const top = area.y ?? 10;
  const width = area.width ?? 20;
  const height = area.height ?? 10;
  const longitude = (value: number) => mapWest + ((mapEast - mapWest) * value) / 100;
  const latitude = (value: number) => mapNorth - ((mapNorth - mapSouth) * value) / 100;
  return [
    [latitude(top + height), longitude(left)],
    [latitude(top), longitude(left + width)],
  ];
}

function areaStyle(type: MapHotAreaSummary["objectType"]): PathOptions {
  if (type === "road") return { color: "#0a65d8", fillColor: "#1d6fff", fillOpacity: 0.14, weight: 2 };
  if (type === "point") return { color: "#0c9f90", fillColor: "#29c7e8", fillOpacity: 0.16, weight: 2 };
  return { color: "#4b83ff", fillColor: "#4b83ff", fillOpacity: 0.14, weight: 2 };
}

export function DashboardTileMap({ hotAreas, issueCountByObject, onOpenArea, onOpenIssues }: DashboardTileMapProps) {
  return (
    <div className="dashboard-tile-map">
      <MapContainer
        attributionControl={false}
        bounds={quyangBounds}
        center={[31.287, 121.487]}
        maxBounds={quyangBounds}
        maxBoundsViscosity={1}
        maxZoom={18}
        minZoom={16}
        scrollWheelZoom
        zoom={17}
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          bounds={quyangBounds}
          keepBuffer={1}
          maxNativeZoom={18}
          minNativeZoom={16}
          noWrap
          tileSize={256}
          updateWhenIdle
          url="/maps/quyang-2026-01/{z}/{x}/{y}.png"
        />
        {hotAreas.map((area) => {
          const issueCount = issueCountByObject[area.label] ?? 0;
          return (
            <Rectangle
              bounds={areaBounds(area)}
              eventHandlers={{ click: () => onOpenArea(area) }}
              key={area.id}
              pathOptions={areaStyle(area.objectType)}
            >
              <Tooltip className={`dashboard-map-label ${area.objectType}`} direction="center" opacity={1} permanent>
                <strong>{area.label}</strong>
                <span>{objectTypeLabel(area)} / 问题 {issueCount}</span>
              </Tooltip>
            </Rectangle>
          );
        })}
        <CircleMarker center={[31.2875, 121.4868]} eventHandlers={{ click: () => onOpenIssues("pending") }} pathOptions={{ color: "#e74747", fillColor: "#e74747", fillOpacity: 0.95 }} radius={8}>
          <Tooltip direction="top">待处理问题</Tooltip>
        </CircleMarker>
        <CircleMarker center={[31.2839, 121.491]} eventHandlers={{ click: () => onOpenIssues("processing") }} pathOptions={{ color: "#f59a23", fillColor: "#f59a23", fillOpacity: 0.95 }} radius={8}>
          <Tooltip direction="top">处理中问题</Tooltip>
        </CircleMarker>
        <CircleMarker center={[31.2805, 121.4842]} eventHandlers={{ click: () => onOpenIssues("verified") }} pathOptions={{ color: "#20a66a", fillColor: "#20a66a", fillOpacity: 0.95 }} radius={8}>
          <Tooltip direction="top">复查通过问题</Tooltip>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
