import test from "node:test";
import assert from "node:assert/strict";
import { announcementNotices, withAnnouncementNotices } from "../../app/src/lib/announcementNotices.js";
import { buildAnnouncementEmail, channelsFor, deliverAnnouncementReminders, reminderAudience } from "../src/announcementNotify.js";
import { buildNoticeText, societyNoticePayload } from "../src/whatsapp.js";
import { bookingNotices, withBookingNotices } from "../../app/src/lib/bookingNotices.js";

const NOW = new Date("2026-09-23T12:00:00.000Z").getTime();
const day = 864e5;

test("a pinned notice stays on the attention list and an old unpinned one does not", () => {
  const rows = announcementNotices(
    [
      { id: "old", title: "Old water notice", body: "Done", createdAt: new Date(NOW - 40 * day).toISOString() },
      { id: "agm", title: "AGM scheduled on 15th October 2026 at 10 am", body: "Please gather near club house at 10 am", pinned: true, createdAt: new Date(NOW - 20 * day).toISOString() },
      { id: "week", title: "Lift maintenance", body: "Tomorrow morning", createdAt: new Date(NOW - 2 * day).toISOString() },
    ],
    { now: NOW }
  );
  assert.deepEqual(rows.map((r) => r.announcementId), ["agm", "week"]);
  assert.equal(rows[0].route, "Community");
  assert.equal(rows[0].label, "AGM scheduled on 15th October 2026 at 10 am");
  assert.match(rows[0].detail, /club house/);
});

test("opening a notice removes it and leaves the other attention rows", () => {
  const summary = {
    pending: [{ key: "bills", label: "₹500 outstanding" }],
  };
  const merged = withAnnouncementNotices(
    summary,
    [
      { id: "agm", title: "AGM", body: "Club house", pinned: true, createdAt: new Date(NOW).toISOString() },
      { id: "lift", title: "Lift", body: "Tomorrow", createdAt: new Date(NOW).toISOString() },
    ],
    { now: NOW, dismissed: ["agm"] }
  );
  assert.deepEqual(merged.pending.map((p) => p.key), ["announcement:lift", "bills"]);
});

test("email goes out when there is an email, WhatsApp when there is a phone, and both when both exist", async () => {
  const calls = [];
  const users = [
    { id: "mail", name: "Asha", email: "asha@example.com", active: true },
    { id: "phone", name: "Ravi", email: "", phone: "9876543210", active: true },
    { id: "both", name: "Meera", email: "meera@example.com", phone: "+91 90000 11111", active: true, notifyEnabled: true, expoPushToken: "ExponentPushToken[abc]" },
    { id: "author", name: "Admin", email: "admin@example.com", phone: "9999999999", active: true },
    { id: "pending", name: "New", email: "new@example.com", phone: "8888888888", active: true, pendingApproval: true },
    { id: "off", name: "Left", email: "left@example.com", active: false },
  ];
  assert.equal(reminderAudience(users, { authorId: "author" }).length, 3);
  assert.deepEqual(channelsFor(users[0]), { email: "asha@example.com", phone: null, push: null });
  assert.equal(channelsFor(users[2]).push, "ExponentPushToken[abc]");

  const result = await deliverAnnouncementReminders({
    users,
    announcement: { id: "agm", title: "AGM scheduled", body: "Club house at 10 am", createdBy: "author" },
    societyName: "Paritosh",
    authorId: "author",
    sendEmail: async (msg) => {
      calls.push(["email", msg.to, msg.subject]);
      return { delivered: true };
    },
    sendWhatsApp: async (msg) => {
      calls.push(["whatsapp", msg.toPhone, msg.title]);
      return { sent: true };
    },
    sendPush: async (token, title) => {
      calls.push(["push", token, title]);
      return { ok: true };
    },
  });

  assert.equal(result.audience, 3);
  assert.equal(result.emailed, 2);
  assert.equal(result.whatsapp, 2);
  assert.equal(result.pushed, 1);
  assert.deepEqual(
    calls.map((c) => `${c[0]}:${c[1]}`).sort(),
    [
      "email:asha@example.com",
      "email:meera@example.com",
      "push:ExponentPushToken[abc]",
      "whatsapp:+91 90000 11111",
      "whatsapp:9876543210",
    ]
  );
  const mail = buildAnnouncementEmail({ title: "AGM scheduled", body: "Club house at 10 am", societyName: "Paritosh" });
  assert.equal(mail.subject, "Paritosh: AGM scheduled");
  assert.match(mail.text, /Needs your attention/);
  assert.equal(calls.some((c) => String(c[1]).includes("admin@")), false);
  assert.equal(calls.some((c) => String(c[1]).includes("new@")), false);
});

test("a failed email or WhatsApp does not stop the other reminders", async () => {
  const result = await deliverAnnouncementReminders({
    users: [{ id: "both", email: "meera@example.com", phone: "9000011111", active: true }],
    announcement: { id: "agm", title: "AGM", body: "Come" },
    societyName: "Paritosh",
    sendEmail: async () => {
      throw new Error("mailbox down");
    },
    sendWhatsApp: async () => ({ sent: true }),
    sendPush: async () => ({ ok: false }),
  });
  assert.equal(result.emailed, 0);
  assert.equal(result.whatsapp, 1);
});

test("an approved clubhouse booking is called out with the amount to pay", () => {
  const rows = bookingNotices(
    [
      { id: "b1", residentId: "me", amenityName: "Clubhouse", slotLabel: "Morning", date: "2026-09-23", status: "approved", amount: 1000 },
      { id: "b2", residentId: "me", amenityName: "Clubhouse", slotLabel: "Evening", date: "2026-09-24", status: "requested", amount: 1000 },
      { id: "b3", residentId: "me", amenityName: "Clubhouse", slotLabel: "Morning", date: "2026-09-20", status: "paid", amount: 1000 },
      { id: "b4", residentId: "other", amenityName: "Clubhouse", slotLabel: "Morning", date: "2026-09-23", status: "approved", amount: 500 },
    ],
    { residentId: "me" }
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "Clubhouse approved");
  assert.equal(rows[0].detail, "Morning · Wed, Sep 23 · Pay ₹1,000");
  assert.equal(rows[0].route, "Community");
  assert.deepEqual(rows[0].params, { screen: "Amenities", params: { tab: "mine" } });

  const merged = withBookingNotices(
    { pending: [{ key: "bookings", label: "1 booking approved" }, { key: "bills", label: "dues" }] },
    [{ id: "b1", residentId: "me", amenityName: "Clubhouse", status: "approved", amount: 1000, date: "2026-09-23" }]
  );
  assert.deepEqual(merged.pending.map((p) => p.key), ["booking:b1", "bills"]);
});

test("a society notice never uses the fee reminder template", () => {
  const plain = societyNoticePayload({
    to: "919000011111",
    name: "Meera",
    societyName: "Paritosh",
    title: "AGM scheduled",
    body: "Club house\nat 10 am",
    templateName: "",
  });
  assert.equal(plain.type, "text");
  assert.equal(plain.template, undefined);
  assert.match(plain.text.body, /Society notice from Paritosh/);
  assert.doesNotMatch(plain.text.body, /fee reminder/i);

  const templated = societyNoticePayload({
    to: "919000011111",
    name: "Meera",
    societyName: "Paritosh",
    title: "AGM",
    body: "Line one\nLine two",
    templateName: "society_notice",
  });
  assert.equal(templated.template.name, "society_notice");
  assert.notEqual(templated.template.name, "fee_reminder");
  assert.equal(templated.template.components[0].parameters[3].text, "Line one Line two");
  assert.match(buildNoticeText({ name: "Meera", societyName: "Paritosh", title: "AGM", body: "Come" }), /Dear Meera/);
});
