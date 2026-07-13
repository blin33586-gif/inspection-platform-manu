import assert from "node:assert/strict";
import test from "node:test";
import { issueLibraryStatus, issueStatusPatch } from "./issue-library-presenter";

test("presents only pending and processed issue states", () => {
  assert.equal(issueLibraryStatus("pending"), "pending");
  assert.equal(issueLibraryStatus("processing"), "processed");
  assert.equal(issueLibraryStatus("rectified"), "processed");
  assert.equal(issueLibraryStatus("verified"), "processed");
  assert.equal(issueLibraryStatus("ignored"), "processed");
  assert.equal(issueLibraryStatus("archived"), "processed");
});

test("maps the two library actions to persisted issue statuses", () => {
  assert.equal(issueStatusPatch("pending"), "pending");
  assert.equal(issueStatusPatch("processed"), "verified");
});
