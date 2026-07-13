import assert from "node:assert/strict";
import test from "node:test";
import { MapHotAreaService } from "./map-hot-area.service.js";

test("converts a legacy uploaded map to the canonical published state when adding a hot area", async () => {
  let mapUpdate: Record<string, unknown> | undefined;
  const database = {
    mapAsset: {
      findUnique: async () => ({ id: "map-legacy", name: "旧地图", processStatus: "uploaded" }),
      update: async (input: Record<string, unknown>) => { mapUpdate = input; return input; },
    },
    mapHotArea: {
      create: async () => ({
        id: "hot-area-1",
        label: "入口",
        objectType: "point",
        objectId: null,
        x: null,
        y: null,
        width: null,
        height: null,
        polygon: null,
        color: null,
      }),
    },
  };
  const service = new MapHotAreaService(database as never, { record: async () => undefined } as never);

  await service.create("map-legacy", { label: "入口", objectType: "point" });

  assert.equal((mapUpdate?.data as Record<string, unknown>).processStatus, "published");
});

test("updates a named community area without changing its linked archive", async () => {
  const updateCalls: Array<{ data: Record<string, unknown> }> = [];
  const auditRecords: Array<{ action: string; summary: string }> = [];
  const database = {
    mapHotArea: {
      findFirst: async () => ({
        id: "ha-yutian",
        label: "玉田新村",
        objectType: "community",
        objectId: "c-yutian",
        mapAsset: { name: "曲阳街道总览图" },
      }),
      update: async (input: { data: Record<string, unknown> }) => {
        updateCalls.push(input);
        return {
          id: "ha-yutian",
          label: input.data.label,
          objectType: "community",
          objectId: "c-yutian",
          x: null,
          y: null,
          width: null,
          height: null,
          polygon: input.data.polygon,
        };
      },
    },
  };
  const auditService = {
    record: async (input: { action: string; summary: string }) => {
      auditRecords.push(input);
    },
  };
  const service = new MapHotAreaService(database as never, auditService as never);

  const result = await service.update("map-street-main", "ha-yutian", {
    label: "玉田新村北区",
    polygon: JSON.stringify({
      shape: "polygon",
      coordinates: [[31.287, 121.486], [31.288, 121.489], [31.286, 121.49]],
    }),
  });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].data.label, "玉田新村北区");
  assert.equal(result.objectId, "c-yutian");
  assert.equal(auditRecords[0].action, "map.hotArea.update");
});

test("stores a selected map boundary color", async () => {
  const updateCalls: Array<{ data: Record<string, unknown> }> = [];
  const database = {
    mapHotArea: {
      findFirst: async () => ({
        id: "ha-quyang",
        label: "曲阳路",
        objectType: "road",
        objectId: "r-quyang",
        mapAsset: { name: "曲阳街道总览图" },
      }),
      update: async (input: { data: Record<string, unknown> }) => {
        updateCalls.push(input);
        return {
          id: "ha-quyang",
          label: "曲阳路",
          objectType: "road",
          objectId: "r-quyang",
          x: null,
          y: null,
          width: null,
          height: null,
          polygon: null,
          color: input.data.color,
        };
      },
    },
  };
  const auditService = { record: async () => undefined };
  const service = new MapHotAreaService(database as never, auditService as never);

  const result = await service.update("map-street-main", "ha-quyang", { color: "#52c41a" });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].data.color, "#52c41a");
  assert.equal(result.color, "#52c41a");
});

test("deletes a selected hot area and records the map audit", async () => {
  const deletedIds: string[] = [];
  const mapAssetUpdates: Array<{ data: Record<string, unknown> }> = [];
  const auditRecords: Array<{ action: string; targetId?: string }> = [];
  const transaction = {
    mapHotArea: {
      delete: async ({ where }: { where: { id: string } }) => {
        deletedIds.push(where.id);
      },
    },
    mapAsset: {
      update: async (input: { data: Record<string, unknown> }) => {
        mapAssetUpdates.push(input);
      },
    },
  };
  const database = {
    mapHotArea: {
      findFirst: async () => ({
        id: "ha-yutian",
        label: "玉田新村",
        mapAsset: { name: "曲阳街道总览图" },
      }),
    },
    $transaction: async (callback: (client: typeof transaction) => Promise<void>) => callback(transaction),
  };
  const auditService = {
    record: async (input: { action: string; targetId?: string }) => {
      auditRecords.push(input);
    },
  };
  const service = new MapHotAreaService(database as never, auditService as never);

  await service.remove("map-street-main", "ha-yutian");

  assert.deepEqual(deletedIds, ["ha-yutian"]);
  assert.deepEqual(mapAssetUpdates[0].data, { hotAreaCount: { decrement: 1 } });
  assert.equal(auditRecords[0].action, "map.hotArea.delete");
  assert.equal(auditRecords[0].targetId, "ha-yutian");
});
