export type MediaTaskAssetKind = "video" | "image_bundle";

export function getMediaPreviewMode(assetKind: MediaTaskAssetKind, hovered: boolean) {
  return assetKind === "video" && hovered ? "video" : "poster";
}
