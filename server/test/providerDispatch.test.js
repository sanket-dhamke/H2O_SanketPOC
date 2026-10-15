import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPT_WINDOW_MS,
  packCovers,
  offersService,
  isBusy,
  rankProviders,
  nextOffer,
  fallbackProvider,
  worksAt,
  completionMatches,
} from "../src/providerDispatch.js";

const now = new Date("2026-10-12T12:00:00Z");

function pro(partial) {
  return {
    id: partial.id,
    active: true,
    fallback: false,
    serviceSlugs: "ac",
    packPaidUntil: "2027-10-12T00:00:00Z",
    ratingAvg: 4,
    ...partial,
  };
}

test("accept window is 60 seconds, one professional at a time", () => {
  assert.equal(ACCEPT_WINDOW_MS, 60_000);
});

test("annual pack must be paid unless this is the house desk", () => {
  assert.equal(packCovers(pro({ packPaidUntil: "2026-10-01T00:00:00Z" }), now), false);
  assert.equal(packCovers(pro({ packPaidUntil: "2027-01-01T00:00:00Z" }), now), true);
  assert.equal(packCovers(pro({ fallback: true, packPaidUntil: null }), now), true);
  assert.equal(packCovers(pro({ active: false, fallback: true }), now), false);
});

test("only a professional who lists the service can take it", () => {
  assert.equal(offersService(pro({ serviceSlugs: "ac,cleaning" }), "cleaning"), true);
  assert.equal(offersService(pro({ serviceSlugs: "salon" }), "ac"), false);
});

test("a professional already offered or on a job in that slot is busy", () => {
  const bookings = [
    { scheduledDate: "2026-10-13", slot: "14:00–15:00", status: "offered", offerProviderId: "a", providerId: null },
    { scheduledDate: "2026-10-13", slot: "14:00–15:00", status: "completed", providerId: "b", offerProviderId: null },
  ];
  assert.equal(isBusy("a", bookings, "2026-10-13", "14:00–15:00"), true);
  assert.equal(isBusy("b", bookings, "2026-10-13", "14:00–15:00"), false);
});

test("next offer is the highest-rated free pro, skipping declines and the desk", () => {
  const providers = [
    pro({ id: "low", ratingAvg: 3 }),
    pro({ id: "high", ratingAvg: 4.9 }),
    pro({ id: "desk", fallback: true, ratingAvg: 5, serviceSlugs: "ac" }),
    pro({ id: "busy", ratingAvg: 5 }),
  ];
  const booking = { serviceSlug: "ac", declinedIds: "low" };
  const picked = nextOffer(providers, booking, new Set(["busy"]));
  assert.equal(picked.id, "high");
  assert.equal(rankProviders(providers).some((p) => p.fallback), false);
});

test("a professional is bookable only inside their hours", () => {
  const monday = "2026-10-12";
  const tuesday = "2026-10-13";
  const slot = "14:00–15:00";
  assert.equal(worksAt(pro({ offDays: "1" }), monday, slot), false);
  assert.equal(worksAt(pro({ workEnd: "13:00" }), tuesday, slot), false);
  assert.equal(worksAt(pro({}), tuesday, slot), true);
  assert.equal(worksAt(pro({ fallback: true, offDays: "1", workEnd: "13:00" }), monday, slot), true);
});

test("next offer skips a professional who is off that day", () => {
  const providers = [
    pro({ id: "off", ratingAvg: 5, offDays: "1" }),
    pro({ id: "on", ratingAvg: 4, offDays: "0" }),
  ];
  const booking = { serviceSlug: "ac", declinedIds: "", scheduledDate: "2026-10-12", slot: "14:00–15:00" };
  assert.equal(nextOffer(providers, booking, new Set()).id, "on");
});

test("finish code must match the second OTP", () => {
  assert.equal(completionMatches({ completeOtp: "4321" }, "4321"), true);
  assert.equal(completionMatches({ completeOtp: "4321" }, "0000"), false);
  assert.equal(completionMatches({ completeOtp: "4321" }, "432"), false);
});

test("house desk is the last stop after everyone else has passed", () => {
  const providers = [
    pro({ id: "desk", fallback: true, serviceSlugs: "ac,cleaning" }),
    pro({ id: "ac1", serviceSlugs: "ac" }),
  ];
  const booking = { serviceSlug: "cleaning", declinedIds: "" };
  assert.equal(nextOffer(providers, booking, new Set()), null);
  assert.equal(fallbackProvider(providers, booking, new Set()).id, "desk");
  assert.equal(fallbackProvider(providers, { serviceSlug: "ac", declinedIds: "desk" }, new Set()), null);
});
