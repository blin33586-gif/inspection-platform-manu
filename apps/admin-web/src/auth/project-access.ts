export type ProjectRole = "platform_admin" | "member";

export interface ProjectArchiveDimension {
  key: "community" | "road" | "point";
  label: string;
}

export interface SessionProject {
  id: string;
  name: string;
  shortName: string;
  customerType: string;
  archiveDimensions: ProjectArchiveDimension[];
}

const pathsByDimension: Record<ProjectArchiveDimension["key"], string> = {
  community: "/communities",
  road: "/roads",
  point: "/points",
};

export function canModifyProject(role: ProjectRole | string | undefined) {
  return role === "platform_admin" || role === "member";
}

export function canManagePlatform(role: ProjectRole | string | undefined) {
  return role === "platform_admin";
}

export function projectArchiveNavigation(project: SessionProject | null) {
  return (project?.archiveDimensions ?? []).map((dimension) => ({
    to: pathsByDimension[dimension.key],
    label: dimension.label,
  }));
}
