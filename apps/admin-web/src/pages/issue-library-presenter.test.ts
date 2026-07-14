import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { issueLibraryStatus } from "./issue-library-presenter";

test("presents only pending and processed issue states", () => {
  assert.equal(issueLibraryStatus("pending"), "pending");
  assert.equal(issueLibraryStatus("processing"), "processed");
  assert.equal(issueLibraryStatus("rectified"), "processed");
  assert.equal(issueLibraryStatus("verified"), "processed");
  assert.equal(issueLibraryStatus("ignored"), "processed");
  assert.equal(issueLibraryStatus("archived"), "processed");
});

test("issue library only links to details and has no shortcut status actions", async () => {
  const page = await readFile(new URL("./IssuesPage.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /patchJsonApi/);
  assert.doesNotMatch(page, /issueStatusPatch/);
  assert.doesNotMatch(page, /标记已处理/);
  assert.doesNotMatch(page, /恢复待处理/);
  assert.match(page, /navigate\(`\/issues\/\$\{issue\.id\}`\)/);
});
