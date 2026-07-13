WITH "pendingTiffJobs" AS (
  SELECT DISTINCT ON (job."projectId", extracted."mapAssetId")
    job."projectId",
    extracted."mapAssetId",
    job."status"
  FROM "MediaProcessingJob" AS job
  CROSS JOIN LATERAL (
    SELECT substring(job."inputJson" FROM '"mapAssetId"[[:space:]]*:[[:space:]]*"([A-Za-z0-9._-]+)"') AS "mapAssetId"
  ) AS extracted
  WHERE job."jobType" = 'tiff_tile'
    AND job."status" IN ('queued', 'running')
    AND job."inputJson" IS JSON OBJECT
    AND extracted."mapAssetId" IS NOT NULL
  ORDER BY
    job."projectId",
    extracted."mapAssetId",
    CASE job."status" WHEN 'running' THEN 0 ELSE 1 END
)
UPDATE "MapAsset" AS asset
SET "processStatus" = pending."status"
FROM "pendingTiffJobs" AS pending
WHERE asset."processStatus" = 'uploaded'
  AND asset."projectId" = pending."projectId"
  AND asset."id" = pending."mapAssetId";

UPDATE "MapAsset" AS asset
SET "processStatus" = 'published'
WHERE asset."processStatus" IN ('processed', 'ready')
  OR (
    asset."processStatus" = 'uploaded'
    AND NOT EXISTS (
      SELECT 1
      FROM "MediaProcessingJob" AS pending
      WHERE pending."projectId" = asset."projectId"
        AND pending."jobType" = 'tiff_tile'
        AND pending."status" IN ('queued', 'running')
        AND pending."inputJson" IS JSON OBJECT
        AND substring(pending."inputJson" FROM '"mapAssetId"[[:space:]]*:[[:space:]]*"([A-Za-z0-9._-]+)"') = asset."id"
    )
  );

UPDATE "MapAsset"
SET "processStatus" = 'running'
WHERE "processStatus" = 'processing';
