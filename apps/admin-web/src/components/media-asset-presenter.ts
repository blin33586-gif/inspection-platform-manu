export interface MediaChildAssetRecord {
  id: string;
  kind: "frame" | "image";
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  videoTimestampMs: number | null;
  createdAt: string;
}

export interface MediaGalleryItem extends MediaChildAssetRecord {
  caption: string;
  contentUrl: string;
}

export function formatMediaCaption(asset: Pick<MediaChildAssetRecord, "kind" | "videoTimestampMs" | "originalFileName">) {
  if (asset.kind === "image" || asset.videoTimestampMs === null) return asset.originalFileName;

  const totalSeconds = Math.max(0, Math.floor(asset.videoTimestampMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const minuteSecond = `${pad(minutes)}:${pad(seconds)}`;
  return hours ? `${pad(hours)}:${minuteSecond}` : minuteSecond;
}

export function toMediaGalleryItem(asset: MediaChildAssetRecord, contentUrl: string): MediaGalleryItem {
  return { ...asset, caption: formatMediaCaption(asset), contentUrl };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
