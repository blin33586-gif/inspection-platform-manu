import assert from "node:assert/strict";
import test from "node:test";
import { MapHotAreaService } from "./map-hot-area.service.js";

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
