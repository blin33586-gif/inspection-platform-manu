UPDATE "MapAsset"
SET "processStatus" = 'published'
WHERE "processStatus" IN ('processed', 'uploaded', 'ready');

UPDATE "MapAsset"
SET "processStatus" = 'running'
WHERE "processStatus" = 'processing';
