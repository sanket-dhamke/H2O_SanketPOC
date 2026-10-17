import test from "node:test";
import assert from "node:assert/strict";
import { listingAttentionNotices } from "../src/listingInbox.js";
import { attentionSignature, hideDismissed } from "../../app/src/lib/attentionDismiss.js";

const owner = { userId: "owner", flatId: "flat-903" };
const spouse = { userId: "spouse", flatId: "flat-903" };
const buyer = { userId: "buyer", flatId: "flat-1002" };
const other = { userId: "other", flatId: "flat-204" };

function msg(partial) {
  return {
    listingId: "sofa",
    listingTitle: "Sofa (3+2)",
    listingAuthorId: "owner",
    authorFlatId: "flat-903",
    toUserId: null,
    fromFlat: null,
    fromFlatId: null,
    ...partial,
  };
}

test("the seller and their flat see a buyer message, and the buyer does not see their own as new", () => {
  const messages = [
    msg({
      id: "m1",
      fromUserId: "buyer",
      fromName: "Leena",
      fromFlat: "A-1002",
      fromFlatId: "flat-1002",
      body: "Is the sofa still available?",
      createdAt: "2026-10-17T04:00:00.000Z",
    }),
  ];
  const seller = listingAttentionNotices(messages, owner);
  assert.equal(seller.length, 1);
  assert.equal(seller[0].key, "listing-message:m1");
  assert.equal(seller[0].label, "Message about Sofa (3+2)");
  assert.match(seller[0].detail, /Leena · A-1002: Is the sofa still available/);
  assert.equal(seller[0].params.screen, "ListingDetail");
  assert.equal(seller[0].params.params.id, "sofa");
  assert.equal(listingAttentionNotices(messages, spouse).length, 1);
  assert.equal(listingAttentionNotices(messages, buyer).length, 0);
});

test("a reply notifies the buyer and clears the seller notice until a newer message arrives", () => {
  const messages = [
    msg({
      id: "m1",
      fromUserId: "buyer",
      fromName: "Leena",
      fromFlat: "A-1002",
      toUserId: "owner",
      body: "Is the sofa still available?",
      createdAt: "2026-10-17T04:00:00.000Z",
    }),
    msg({
      id: "m2",
      fromUserId: "owner",
      fromName: "Paritosh",
      fromFlatId: "flat-903",
      toUserId: "buyer",
      body: "Yes, you can see it this evening.",
      createdAt: "2026-10-17T05:00:00.000Z",
    }),
  ];
  assert.equal(listingAttentionNotices(messages, owner).length, 0);
  assert.equal(listingAttentionNotices(messages, spouse).length, 0);
  const forBuyer = listingAttentionNotices(messages, buyer);
  assert.equal(forBuyer.length, 1);
  assert.equal(forBuyer[0].key, "listing-message:m2");
  assert.match(forBuyer[0].detail, /Yes, you can see it this evening/);

  const again = [
    ...messages,
    msg({
      id: "m3",
      fromUserId: "buyer",
      fromName: "Leena",
      toUserId: "owner",
      body: "I will come at 6.",
      createdAt: "2026-10-17T06:00:00.000Z",
    }),
  ];
  assert.equal(listingAttentionNotices(again, owner)[0].key, "listing-message:m3");
  assert.equal(listingAttentionNotices(again, buyer).length, 0);
});

test("one buyer never sees another buyer's enquiry", () => {
  const messages = [
    msg({
      id: "a",
      fromUserId: "buyer",
      fromName: "Leena",
      toUserId: "owner",
      body: "Mine",
      createdAt: "2026-10-17T04:00:00.000Z",
    }),
    msg({
      id: "b",
      fromUserId: "other",
      fromName: "Rohan",
      fromFlat: "B-204",
      toUserId: "owner",
      body: "I want it too",
      createdAt: "2026-10-17T04:30:00.000Z",
    }),
  ];
  assert.equal(listingAttentionNotices(messages, buyer).length, 0);
  assert.equal(listingAttentionNotices(messages, other).length, 0);
  const seller = listingAttentionNotices(messages, owner);
  assert.deepEqual(
    seller.map((row) => row.key).sort(),
    ["listing-message:a", "listing-message:b"]
  );
});

test("removing an attention row hides that exact notice and a new listing message can return", () => {
  const summary = {
    pending: [
      { key: "bills", label: "₹4,000 outstanding", detail: "Pay from the bills tab." },
      { key: "listing-message:m1", label: "Message about Sofa (3+2)", detail: "Leena: Hi" },
      { key: "announcement:old", announcementId: "old", label: "Water shutdown", detail: "Tonight" },
    ],
  };
  const sofa = summary.pending[1];
  const hidden = hideDismissed(summary, [attentionSignature(sofa), "old"]);
  assert.deepEqual(
    hidden.pending.map((row) => row.key),
    ["bills"]
  );
  const later = hideDismissed(
    {
      pending: [
        { key: "bills", label: "₹4,000 outstanding" },
        { key: "listing-message:m3", label: "Message about Sofa (3+2)", detail: "Leena: 6 pm" },
      ],
    },
    [attentionSignature(sofa)]
  );
  assert.deepEqual(
    later.pending.map((row) => row.key),
    ["bills", "listing-message:m3"]
  );
});
