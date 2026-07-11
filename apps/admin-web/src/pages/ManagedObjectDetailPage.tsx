import { useMemo } from "react";
import { Button } from "antd";
import { useParams } from "react-router-dom";
import type { ManagedObjectSummary } from "@xunjianbao/shared";
import { communities, points, roads } from "../data";
import { ApiResourceError } from "../components/ApiResourceError";
import { PageHeader } from "../components/PageHeader";
import { ProjectArchiveWorkspace, type ProjectArchiveGroup, type ProjectArchiveItem } from "../components/ProjectArchiveWorkspace";
import { useApiResource } from "../hooks/useApiResource";

interface ManagedObjectDetailPageProps {
  objectType: "community" | "road";
}

function fallbackObject(objectType: "community" | "road", id: string | undefined): ManagedObjectSummary {
  const source = objectType === "community" ? communities : roads;
  return source.find((item) => item.id === id) ?? source[0];
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

function projectGroups(activeItems: ProjectArchiveItem[], objectType: "community" | "road"): ProjectArchiveGroup[] {
  const communityItems = objectType === "community" ? activeItems : communityArchiveItems();
  const roadItems = objectType === "road" ? activeItems : roadArchiveItems();

  return [
    { key: "community", label: "小区档案", path: "/communities", items: communityItems },
    { key: "road", label: "街道档案", path: "/roads", items: roadItems },
    { key: "point", label: "重点点位", path: "/points", items: pointArchiveItems() },
  ];
}

export function ManagedObjectDetailPage({ objectType }: ManagedObjectDetailPageProps) {
  const { id } = useParams();
  const basePath = objectType === "community" ? "communities" : "roads";
  const listPath = objectType === "community" ? "/communities" : "/roads";
  const label = objectType === "community" ? "小区" : "道路";
  const fallback = useMemo(() => fallbackObject(objectType, id), [id, objectType]);
  const { data: object, error, reload } = useApiResource<ManagedObjectSummary>(`/${basePath}/${id}`, fallback);
  const archiveItems = useMemo<ProjectArchiveItem[]>(() => {
    const source = objectType === "community" ? communityArchiveItems() : roadArchiveItems();
    const existingIndex = source.findIndex((item) => item.id === object.id);
    const activeItem: ProjectArchiveItem = {
      id: object.id,
      name: object.name,
      status: object.status,
      issueCount: object.issueCount,
      reportCount: object.reportCount,
      typeLabel: objectType === "community" ? "居住小区" : "道路街面",
      path: `/${basePath}/${object.id}`,
    };

    if (existingIndex === -1) return [activeItem, ...source];
    return source.map((item, index) => (index === existingIndex ? activeItem : item));
  }, [basePath, object, objectType]);
  const activeArchiveItem = archiveItems.find((item) => item.id === object.id) ?? archiveItems[0];

  if (error) return <ApiResourceError error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title={`${object.name}${label}档案`} actions={<Button href={listPath}>返回列表</Button>} />
      <ProjectArchiveWorkspace
        activeItem={activeArchiveItem}
        items={archiveItems}
        projectGroups={projectGroups(archiveItems, objectType)}
        variant={objectType}
      />
    </>
  );
}
