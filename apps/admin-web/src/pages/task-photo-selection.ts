export type TaskPhotoStatusFilter = "all" | "pending" | "archived" | "ignored";

export interface TaskPhotoSelectionRecord {
  id: string;
  distributionStatus: string;
  mediaAsset: { id: string };
}

export function defaultTaskPhotoSelection(
  photos: TaskPhotoSelectionRecord[],
  preferredMediaId?: string | null,
) {
  const selected = photos
    .filter((photo) => photo.distributionStatus !== "ignored")
    .map((photo) => photo.id);
  const preferred = photos.find((photo) => photo.mediaAsset.id === preferredMediaId);
  if (preferred && !selected.includes(preferred.id)) selected.push(preferred.id);
  return selected;
}

export function filterTaskPhotos<T extends TaskPhotoSelectionRecord>(
  photos: T[],
  filter: TaskPhotoStatusFilter,
) {
  if (filter === "all") return photos;
  return photos.filter((photo) => photo.distributionStatus === filter);
}

export function setTaskPhotoSelected(
  current: ReadonlySet<string>,
  photoId: string,
  selected: boolean,
) {
  const next = new Set(current);
  if (selected) next.add(photoId);
  else next.delete(photoId);
  return next;
}
