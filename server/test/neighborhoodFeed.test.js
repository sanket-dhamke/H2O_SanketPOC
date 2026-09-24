import test from "node:test";
import assert from "node:assert/strict";
import { acceptedPeerIds, canMessage, canSeePost, filterFeed } from "../src/neighborhoodFeed.js";

const me = { id: "me", societyId: "soc-a" };
const peers = acceptedPeerIds(
  [
    { requesterId: "me", targetId: "asha", status: "accepted" },
    { requesterId: "ravi", targetId: "me", status: "pending" },
  ],
  "me"
);

test("a society post stays inside that society", () => {
  const post = { authorId: "other", societyId: "soc-a", visibility: "society" };
  assert.equal(canSeePost(post, me, peers), true);
  assert.equal(canSeePost(post, { id: "x", societyId: "soc-b" }, peers), false);
});

test("an all post is visible outside the society, a followers post only to accepted people", () => {
  const outsider = { id: "x", societyId: "soc-b" };
  assert.equal(canSeePost({ authorId: "other", societyId: "soc-a", visibility: "all" }, outsider, new Set()), true);
  assert.equal(canSeePost({ authorId: "asha", societyId: "soc-b", visibility: "followers" }, me, peers), true);
  assert.equal(canSeePost({ authorId: "ravi", societyId: "soc-b", visibility: "followers" }, me, peers), false);
  assert.equal(canMessage("me", "asha", peers), true);
  assert.equal(canMessage("me", "ravi", peers), false);
});

test("the feed hides posts the viewer should not see", () => {
  const rows = filterFeed(
    [
      { id: "1", authorId: "me", societyId: "soc-a", visibility: "followers" },
      { id: "2", authorId: "ravi", societyId: "soc-b", visibility: "followers" },
      { id: "3", authorId: "city", societyId: "soc-c", visibility: "all" },
    ],
    me,
    peers
  );
  assert.deepEqual(rows.map((row) => row.id), ["1", "3"]);
});
