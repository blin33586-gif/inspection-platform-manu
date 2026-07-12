import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { enrichExtractedFrames } from "./frame-telemetry-enrichment.js";

type EnrichFrames = typeof enrichExtractedFrames;

export async function backfillMediaTelemetry(
  mediaId: string,
  database: PrismaClient,
  storageRoot = resolve(process.cwd(), "../api/storage"),
  enrichFrames: EnrichFrames = enrichExtractedFrames,
) {
  const media = await database.mediaAsset.findUnique({
    where: { id: mediaId },
    include: { frames: { include: { taskPhoto: true } } },
  });
  if (!media || media.kind !== "video") throw new Error("原视频不存在");

  const rows = media.frames
    .filter((frame) => frame.taskPhoto && frame.videoTimestampMs !== null)
    .map((frame) => ({
      fileName: frame.originalFileName,
      storagePath: resolve(storageRoot, frame.storagePath.replace(/^storage\//, "")),
      fileSize: frame.fileSize,
      timestampMs: frame.videoTimestampMs!,
    }));
  const result = await enrichFrames(
    resolve(storageRoot, media.storagePath.replace(/^storage\//, "")),
    rows,
  );
  let updated = 0;

  for (const frame of result.frames) {
    if (!frame.telemetry) continue;
    const asset = media.frames.find((item) => item.videoTimestampMs === frame.timestampMs)!;
    const telemetry = frame.telemetry;
    await database.$transaction([
      database.mediaAsset.update({
        where: { id: asset.id },
        data: { fileSize: frame.fileSize },
      }),
      database.taskPhoto.update({
        where: { id: asset.taskPhoto!.id },
        data: {
          capturedAt: telemetry.capturedAt,
          latitude: telemetry.latitude,
          longitude: telemetry.longitude,
          absoluteAltitudeMeters: telemetry.absoluteAltitudeMeters,
          relativeAltitudeMeters: telemetry.relativeAltitudeMeters,
        },
      }),
      database.taskPhotoTelemetry.upsert({
        where: { taskPhotoId: asset.taskPhoto!.id },
        create: {
          id: `telemetry-${asset.taskPhoto!.id}`,
          taskPhotoId: asset.taskPhoto!.id,
          source: "dji_subtitle",
          sourceTimestampMs: telemetry.timestampMs,
          matchOffsetMs: telemetry.matchOffsetMs,
          capturedAt: telemetry.capturedAt,
          latitude: telemetry.latitude,
          longitude: telemetry.longitude,
          relativeAltitudeMeters: telemetry.relativeAltitudeMeters,
          absoluteAltitudeMeters: telemetry.absoluteAltitudeMeters,
          gimbalYawDegrees: telemetry.gimbalYawDegrees,
          gimbalPitchDegrees: telemetry.gimbalPitchDegrees,
          gimbalRollDegrees: telemetry.gimbalRollDegrees,
          focalLengthMillimeters: telemetry.focalLengthMillimeters,
          digitalZoomRatio: telemetry.digitalZoomRatio,
        },
        update: {
          sourceTimestampMs: telemetry.timestampMs,
          matchOffsetMs: telemetry.matchOffsetMs,
          capturedAt: telemetry.capturedAt,
          latitude: telemetry.latitude,
          longitude: telemetry.longitude,
          relativeAltitudeMeters: telemetry.relativeAltitudeMeters,
          absoluteAltitudeMeters: telemetry.absoluteAltitudeMeters,
          gimbalYawDegrees: telemetry.gimbalYawDegrees,
          gimbalPitchDegrees: telemetry.gimbalPitchDegrees,
          gimbalRollDegrees: telemetry.gimbalRollDegrees,
          focalLengthMillimeters: telemetry.focalLengthMillimeters,
          digitalZoomRatio: telemetry.digitalZoomRatio,
        },
      }),
    ]);
    updated++;
  }

  return { updated, ...result.stats };
}

export function readMediaIdArgument(argv: string[]) {
  const flagIndex = argv.indexOf("--media-id");
  const value = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
  return value?.trim() || null;
}

if (process.argv[1]?.endsWith("telemetry-backfill.ts")) {
  const mediaId = readMediaIdArgument(process.argv);
  if (!mediaId) throw new Error("请提供 --media-id");
  const connectionString = process.env.DATABASE_URL
    || "postgresql://xunjianbao:xunjianbao-local-dev@127.0.0.1:5432/xunjianbao?schema=public";
  const database = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  backfillMediaTelemetry(mediaId, database)
    .then((result) => console.log(JSON.stringify(result)))
    .finally(() => database.$disconnect());
}
