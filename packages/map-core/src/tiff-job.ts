export interface TiffTileJobInput {
  mapAssetId: string;
  sourcePath: string;
  minZoom: number;
  maxZoom: number;
}

export interface TiffTileJob extends TiffTileJobInput {
  dedupeKey: string;
  jobType: "tiff_tile";
}

export function createTiffTileJob(mapAssetId: string, sourcePath: string): TiffTileJob {
  return {
    dedupeKey: `tiff_tile:${mapAssetId}:v1`,
    jobType: "tiff_tile",
    mapAssetId,
    sourcePath,
    minZoom: 16,
    maxZoom: 19,
  };
}
