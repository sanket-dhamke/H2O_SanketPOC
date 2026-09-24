import test from "node:test";
import assert from "node:assert/strict";
import { acceptedPeerIds, areaKey, canMessage, canSeePost, filterFeed } from "../src/neighborhoodFeed.js";

const me = { id: "me", societyId: "soc-a", area: "pune" };
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
  assert.equal(canSeePost(post, { id: "x", societyId: "soc-b", area: "pune" }, peers), false);
});

test("an area post reaches nearby societies in the same area, not other areas", () => {
  const punePost = { authorId: "other", societyId: "soc-b", visibility: "area", area: "pune" };
  const mumbaiViewer = { id: "x", societyId: "soc-c", area: "mumbai" };
  // Same area (different society) can see it; a different area cannot.
  assert.equal(canSeePost(punePost, me, peers), true);
  assert.equal(canSeePost(punePost, mumbaiViewer, peers), false);
});

test("a followers post only reaches accepted people, and messaging matches", () => {
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
      { id: "3", authorId: "city", societyId: "soc-c", visibility: "area", area: "pune" },
      { id: "4", authorId: "far", societyId: "soc-d", visibility: "area", area: "mumbai" },
    ],
    me,
    peers
  );
  assert.deepEqual(rows.map((row) => row.id), ["1", "3"]);
});

test("areaKey normalizes a city into a stable key", () => {
  assert.equal(areaKey("  Pune "), "pune");
  assert.equal(areaKey("MUMBAI"), "mumbai");
  assert.equal(areaKey(""), null);
  assert.equal(areaKey(null), null);
});
