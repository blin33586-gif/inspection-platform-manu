import { useMemo } from "react";
import { Button } from "antd";
import { useParams } from "react-router-dom";
import type { PointSummary } from "@xunjianbao/shared";
import { communities, mediaLibraryItems, points, roads } from "../data";
import { ApiResourceError } from "../components/ApiResourceError";
import { PageHeader } from "../components/PageHeader";
import { ProjectArchiveWorkspace, type ProjectArchiveGroup, type ProjectArchiveItem } from "../components/ProjectArchiveWorkspace";
import { useApiResource } from "../hooks/useApiResource";

function fallbackPoint(id: string | undefined): PointSummary {
  return points.find((item) => item.id === id) ?? points[0];
}

function communityArchiveItems(): ProjectArchiveItem[] {
  return communities.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    issueCount: item.issueCount,
    reportCount: item.reportCount,
    typeLabel: "居住小区",
    path: `/communities/${item.id}`,
  }));
}

function roadArchiveItems(): ProjectArchiveItem[] {
  return roads.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    issueCount: item.issueCount,
    reportCount: item.reportCount,
    typeLabel: "道路街面",
    path: `/roads/${item.id}`,
  }));
}

function pointArchiveItems(): ProjectArchiveItem[] {
  return points.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    issueCount: item.issueCount,
    reportCount: item.reportCount,
    typeLabel: item.pointType,
    relatedName: item.relatedObjectName,
    path: `/points/${item.id}`,
  }));
}

function projectGroups(activeItems: ProjectArchiveItem[]): ProjectArchiveGroup[] {
  return [
    { key: "community", label: "小区档案", path: "/communities", items: communityArchiveItems() },
    { key: "road", label: "街道档案", path: "/roads", items: roadArchiveItems() },
    { key: "point", label: "重点点位", path: "/points", items: activeItems },
  ];
}

export function PointDetailPage() {
  const { id } = useParams();
  const fallback = useMemo(() => fallbackPoint(id), [id]);
  const { data: point, error, reload } = useApiResource<PointSummary>(`/points/${id}`, fallback);
  const archiveItems = useMemo<ProjectArchiveItem[]>(() => {
    const source = pointArchiveItems();
    const existingIndex = source.findIndex((item) => item.id === point.id);
    const activeItem: ProjectArchiveItem = {
      id: point.id,
      name: point.name,
      status: point.status,
      issueCount: point.issueCount,
      reportCount: point.reportCount,
      typeLabel: point.pointType,
      relatedName: point.relatedObjectName,
      path: `/points/${point.id}`,
    };

    if (existingIndex === -1) return [activeItem, ...source];
    return source.map((item, index) => (index === existingIndex ? activeItem : item));
  }, [point]);
  const activeArchiveItem = archiveItems.find((item) => item.id === point.id) ?? archiveItems[0];

  if (error) return <ApiResourceError error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title={`${point.name}档案`} actions={<Button href="/points">返回点位列表</Button>} />
      <ProjectArchiveWorkspace
        activeItem={activeArchiveItem}
        items={archiveItems}
        mediaItems={mediaLibraryItems}
        projectGroups={projectGroups(archiveItems)}
        variant="point"
      />
    </>
  );
}
