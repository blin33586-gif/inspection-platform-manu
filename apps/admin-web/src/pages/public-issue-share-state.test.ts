import assert from "node:assert/strict";
import test from "node:test";
import { buildTencentMapUrl } from "./public-issue-share-state.js";
test("builds a map link only with coordinates", () => { assert.match(buildTencentMapUrl(31.2, 121.4, "点位")!, /apis\.map\.qq\.com/); assert.equal(buildTencentMapUrl(null, null, "点位"), null); });
