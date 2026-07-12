import assert from "node:assert/strict";
import test from "node:test";
import { validateIssuePushDraft } from "./issue-event-push-state.js";
test("requires the four business fields", () => { assert.equal(validateIssuePushDraft({ locationName: "", foundAt: "", category: "", description: "" }), false); });
