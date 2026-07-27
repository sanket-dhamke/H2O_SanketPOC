import { Router } from "express";
import { createHmac } from "crypto";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { serializeAmenity, serializeBooking } from "../serializers.js";
import { sendPush } from "../push.js";
import { razorpay, razorpayEnabled, RZP_KEY_ID, RZP_KEY_SECRET } from "../razorpay.js";

// Amenity / clubhouse booking engine (per society).
// Flow: admin enables an amenity + slots (price) -> resident requests a slot on a
// date -> admin approves -> resident pays -> slot is booked.
export const amenitiesRouter = Router();

const sid = (req) => req.user.societyId || "__none__";
const ACTIVE = ["requested", "approved", "paid"]; // statuses that hold a slot

/* =============================== Reads =================================== */
// Enabled amenities (with active slots) that residents can book.
amenitiesRouter.get("/amenities", authRequired, async (req, res) => {
  const amenities = await prisma.amenity.findMany({
    where: { societyId: sid(req), enabled: true },
    include: { slots: { where: { active: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({ amenities: amenities.map(serializeAmenity) });
});

// Bookings: admins see the whole society; everyone else sees only their own.
amenitiesRouter.get("/bookings", authRequired, async (req, res) => {
  const where =
    req.user.role === "admin"
      ? { societyId: sid(req) }
      : { societyId: sid(req), residentId: req.user.id };
  const bookings = await prisma.booking.findMany({
    where,
    include: { amenity: true, slot: true, resident: { include: { flat: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ bookings: bookings.map(serializeBooking) });
});

// Which slot/date combos are already taken (so the UI can disable them).
amenitiesRouter.get("/amenities/:id/availability", authRequired, async (req, res) => {
  const taken = await prisma.booking.findMany({
    where: { societyId: sid(req), amenityId: req.params.id, status: { in: ACTIVE } },
    select: { slotId: true, date: true },
  });
  res.json({ taken });
});

/* ========================= Resident booking ============================== */
amenitiesRouter.post("/bookings", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const { amenityId, slotId, date, notes } = req.body || {};
  if (!amenityId || !slotId || !date) {
    return res.status(400).json({ message: "amenityId, slotId and date are required" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "date must be YYYY-MM-DD" });
  }

  const amenity = await prisma.amenity.findFirst({
    where: { id: amenityId, societyId: sid(req), enabled: true },
    include: { slots: true },
  });
  if (!amenity) return res.status(404).json({ message: "Amenity not available" });
  const slot = amenity.slots.find((s) => s.id === slotId && s.active);
  if (!slot) return res.status(404).json({ message: "Slot not available" });

  // Reject if this slot/date is already held by an active booking.
  const clash = await prisma.booking.findFirst({
    where: { slotId, date, status: { in: ACTIVE } },
  });
  if (clash) return res.status(409).json({ message: "That slot is already booked for this date" });

  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { flatId: true } });
  const booking = await prisma.booking.create({
    data: {
      societyId: req.user.societyId,
      amenityId,
      slotId,
      residentId: req.user.id,
      flatId: me?.flatId || null,
      date,
      amount: slot.price,
      notes: notes ? String(notes).trim() : null,
      status: "requested",
    },
    include: { amenity: true, slot: true, resident: { include: { flat: true } } },
  });
  res.status(201).json({ booking: serializeBooking(booking) });
});

// Resident cancels their own pending/approved booking.
amenitiesRouter.post("/bookings/:id/cancel", authRequired, async (req, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (req.user.role !== "admin" && booking.residentId !== req.user.id) {
    return res.status(403).json({ message: "Not your booking" });
  }
  if (!["requested", "approved"].includes(booking.status)) {
    return res.status(400).json({ message: `Cannot cancel a ${booking.status} booking` });
  }
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "cancelled" },
    include: { amenity: true, slot: true, resident: { include: { flat: true } } },
  });
  res.json({ booking: serializeBooking(updated) });
});

// Fetch a booking the current user is allowed to pay, or send an error response.
async function getPayableBooking(req, res) {
  const booking = await prisma.booking.findFirst({
    where: { id: req.params.id, societyId: sid(req) },
    include: { amenity: true, slot: true },
  });
  if (!booking) {
    res.status(404).json({ message: "Booking not found" });
    return null;
  }
  if (req.user.role !== "admin" && booking.residentId !== req.user.id) {
    res.status(403).json({ message: "Not your booking" });
    return null;
  }
  if (booking.status === "paid") {
    res.status(400).json({ message: "Booking already paid" });
    return null;
  }
  if (booking.status !== "approved") {
    res.status(400).json({ message: "Only approved bookings can be paid" });
    return null;
  }
  return booking;
}

function markBookingPaid(bookingId, paymentRef) {
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: "paid", paidAt: new Date(), paymentRef },
    include: { amenity: true, slot: true, resident: { include: { flat: true } } },
  });
}

// Fallback "mock" payment (used only when Razorpay keys are not configured).
amenitiesRouter.post("/bookings/:id/pay", authRequired, async (req, res) => {
  const booking = await getPayableBooking(req, res);
  if (!booking) return;
  const updated = await markBookingPaid(
    booking.id,
    "BOOK-" + booking.id.slice(0, 8).toUpperCase()
  );
  res.json({ booking: serializeBooking(updated) });
});

// Step 1: create a Razorpay order for the booking; the app opens checkout with it.
amenitiesRouter.post("/bookings/:id/create-order", authRequired, async (req, res) => {
  const booking = await getPayableBooking(req, res);
  if (!booking) return;
  if (!razorpayEnabled) return res.json({ enabled: false });

  const amountPaise = Math.round((booking.amount || 0) * 100);
  if (amountPaise <= 0) {
    return res.status(400).json({ message: "This booking has no payable amount" });
  }

  const payer = await prisma.user.findUnique({
    where: { id: booking.residentId },
    select: { name: true, email: true },
  });

  // Route the amount to the society's Razorpay Route linked account when set.
  const society = await prisma.societyAccount.findFirst({
    where: { societyId: booking.societyId },
    orderBy: { createdAt: "asc" },
  });
  const notes = {
    bookingId: booking.id,
    amenity: booking.amenity?.name || "",
    slot: booking.slot?.label || "",
    date: booking.date,
  };
  const transfers =
    society?.active && society?.razorpayAccountId
      ? [{ account: society.razorpayAccountId, amount: amountPaise, currency: "INR", notes, on_hold: false }]
      : undefined;

  try {
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: booking.id,
      notes,
      ...(transfers ? { transfers } : {}),
    });
    await prisma.booking.update({ where: { id: booking.id }, data: { orderId: order.id } });
    res.json({
      enabled: true,
      keyId: RZP_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      name: "H2O Society",
      description: `${booking.amenity?.name || "Amenity"} · ${booking.slot?.label || ""} · ${booking.date}`,
      prefill: { name: payer?.name || "", email: payer?.email || "" },
    });
  } catch (err) {
    const rzpMsg = err?.error?.description || err?.message;
    console.error("Razorpay booking order failed:", err?.error || err.message);
    const routeIssue = transfers && /route|transfer|linked account/i.test(rzpMsg || "");
    res.status(502).json({
      message: routeIssue
        ? "Payment routing failed. Ensure Razorpay Route is enabled and the linked account id is valid."
        : "Could not create payment order",
    });
  }
});

// Step 2: verify the payment signature returned by checkout, then mark paid.
amenitiesRouter.post("/bookings/:id/verify", authRequired, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: "Missing payment verification fields" });
  }
  const booking = await prisma.booking.findFirst({
    where: { id: req.params.id, societyId: sid(req) },
  });
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (req.user.role !== "admin" && booking.residentId !== req.user.id) {
    return res.status(403).json({ message: "Not your booking" });
  }
  const expected = createHmac("sha256", RZP_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (expected !== razorpay_signature) {
    return res.status(400).json({ message: "Payment verification failed" });
  }
  if (booking.status === "paid") return res.status(400).json({ message: "Booking already paid" });
  const updated = await markBookingPaid(booking.id, razorpay_payment_id);
  res.json({ booking: serializeBooking(updated) });
});

/* ===================== Admin: amenity management ========================= */
amenitiesRouter.get("/admin/amenities", authRequired, roleRequired("admin"), async (req, res) => {
  const amenities = await prisma.amenity.findMany({
    where: { societyId: sid(req) },
    include: { slots: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({ amenities: amenities.map(serializeAmenity) });
});

// Create an amenity. Seeds the default Morning/Afternoon/Evening slots.
amenitiesRouter.post("/admin/amenities", authRequired, roleRequired("admin"), async (req, res) => {
  const { name, description, enabled, defaultPrice } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ message: "Amenity name is required" });
  const price = defaultPrice != null && defaultPrice !== "" ? Number(defaultPrice) : 0;

  const amenity = await prisma.amenity.create({
    data: {
      societyId: req.user.societyId,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      enabled: enabled === undefined ? true : Boolean(enabled),
      slots: {
        create: [
          { label: "Morning", startTime: "08:00", endTime: "12:00", price },
          { label: "Afternoon", startTime: "12:00", endTime: "17:00", price },
          { label: "Evening", startTime: "17:00", endTime: "22:00", price },
        ],
      },
    },
    include: { slots: { orderBy: { createdAt: "asc" } } },
  });
  res.status(201).json({ amenity: serializeAmenity(amenity) });
});

amenitiesRouter.patch("/admin/amenities/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const { name, description, enabled } = req.body || {};
  const amenity = await prisma.amenity.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!amenity) return res.status(404).json({ message: "Amenity not found" });
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (description !== undefined) data.description = description ? String(description).trim() : null;
  if (enabled !== undefined) data.enabled = Boolean(enabled);
  const updated = await prisma.amenity.update({
    where: { id: amenity.id },
    data,
    include: { slots: { orderBy: { createdAt: "asc" } } },
  });
  res.json({ amenity: serializeAmenity(updated) });
});

amenitiesRouter.delete("/admin/amenities/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const amenity = await prisma.amenity.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!amenity) return res.status(404).json({ message: "Amenity not found" });
  await prisma.amenity.delete({ where: { id: amenity.id } });
  res.json({ ok: true });
});

// Add a custom slot to an amenity.
amenitiesRouter.post("/admin/amenities/:id/slots", authRequired, roleRequired("admin"), async (req, res) => {
  const { label, price, startTime, endTime } = req.body || {};
  if (!label || !String(label).trim()) return res.status(400).json({ message: "Slot label is required" });
  const amenity = await prisma.amenity.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!amenity) return res.status(404).json({ message: "Amenity not found" });
  const slot = await prisma.amenitySlot.create({
    data: {
      amenityId: amenity.id,
      label: String(label).trim(),
      price: price != null && price !== "" ? Number(price) : 0,
      startTime: startTime ? String(startTime).trim() : null,
      endTime: endTime ? String(endTime).trim() : null,
    },
  });
  res.status(201).json({ slot });
});

amenitiesRouter.patch("/admin/slots/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const { label, price, active, startTime, endTime } = req.body || {};
  const slot = await prisma.amenitySlot.findFirst({
    where: { id: req.params.id, amenity: { societyId: sid(req) } },
  });
  if (!slot) return res.status(404).json({ message: "Slot not found" });
  const data = {};
  if (label !== undefined) data.label = String(label).trim();
  if (price !== undefined) data.price = Number(price) || 0;
  if (active !== undefined) data.active = Boolean(active);
  if (startTime !== undefined) data.startTime = startTime ? String(startTime).trim() : null;
  if (endTime !== undefined) data.endTime = endTime ? String(endTime).trim() : null;
  const updated = await prisma.amenitySlot.update({ where: { id: slot.id }, data });
  res.json({ slot: updated });
});

amenitiesRouter.delete("/admin/slots/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const slot = await prisma.amenitySlot.findFirst({
    where: { id: req.params.id, amenity: { societyId: sid(req) } },
  });
  if (!slot) return res.status(404).json({ message: "Slot not found" });
  await prisma.amenitySlot.delete({ where: { id: slot.id } });
  res.json({ ok: true });
});

// Admin approves or rejects a booking request.
amenitiesRouter.post("/admin/bookings/:id/decision", authRequired, roleRequired("admin"), async (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "status must be approved or rejected" });
  }
  const booking = await prisma.booking.findFirst({
    where: { id: req.params.id, societyId: sid(req) },
    include: { resident: true, slot: true, amenity: true },
  });
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (booking.status !== "requested") {
    return res.status(400).json({ message: `Booking is already ${booking.status}` });
  }
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status, decidedBy: req.user.id, decidedAt: new Date() },
    include: { amenity: true, slot: true, resident: { include: { flat: true } } },
  });

  if (booking.resident?.expoPushToken) {
    const msg =
      status === "approved"
        ? `Your ${booking.amenity?.name} booking (${booking.slot?.label}, ${booking.date}) is approved. Pay ₹${booking.amount} in the app to confirm.`
        : `Your ${booking.amenity?.name} booking (${booking.slot?.label}, ${booking.date}) was declined.`;
    await sendPush(booking.resident.expoPushToken, `Booking ${status}`, msg, { type: "booking", bookingId: booking.id });
  }
  res.json({ booking: serializeBooking(updated) });
});
