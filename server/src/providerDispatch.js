import { prisma } from "./prisma.js";
import { HOME_SERVICE_SLOTS } from "./homeServicesCatalog.js";

// Home services follow Urban Company, not Ola.
// Urban Company offers a booked slot to one professional at a time and gives
// them about a minute to accept. If they ignore it, the job moves to the next
// free professional with that skill. Ola broadcasts a ride to many drivers for
// ~15–20 seconds because any nearby car can take it. A home visit cannot be
// raced that way, so the accept window here is 60 seconds and strictly sequential.
export const ACCEPT_WINDOW_MS = 60 * 1000;

const BUSY = ["offered", "accepted", "started"];

export function slugList(provider) {
  return String(provider?.serviceSlugs || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function offersService(provider, slug) {
  return slugList(provider).includes(slug);
}

export function slotWindow(slot) {
  const match = String(slot || "").match(/(\d{2}:\d{2}).*?(\d{2}:\d{2})/);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

// date is YYYY-MM-DD. offDays is comma-separated weekday numbers, 0 = Sunday.
export function worksAt(provider, date, slot) {
  if (!provider) return false;
  if (provider.fallback) return true;
  const off = new Set(
    String(provider.offDays ?? "0")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (off.has(String(day))) return false;
  const window = slotWindow(slot);
  if (!window) return true;
  const start = provider.workStart || "09:00";
  const end = provider.workEnd || "20:00";
  return window.start >= start && window.end <= end;
}

export function completionMatches(booking, code) {
  const given = String(code || "").trim();
  return /^\d{4}$/.test(given) && given === String(booking?.completeOtp || "");
}

export function packCovers(provider, now = new Date()) {
  if (!provider?.active) return false;
  if (provider.fallback) return true;
  if (!provider.packPaidUntil) return false;
  return new Date(provider.packPaidUntil).getTime() >= now.getTime();
}

export function declinedSet(booking) {
  return new Set(
    String(booking?.declinedIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isBusy(providerId, bookings, date, slot) {
  return (bookings || []).some(
    (b) =>
      b.scheduledDate === date &&
      b.slot === slot &&
      BUSY.includes(b.status) &&
      (b.providerId === providerId || b.offerProviderId === providerId)
  );
}

// Non-fallback professionals first, highest rating, then stable id.
// The house desk (fallback) is not in this queue; it auto-accepts only after
// everyone else has passed.
export function rankProviders(providers) {
  return [...(providers || [])].filter((p) => !p.fallback).sort((a, b) => {
    const rating = (b.ratingAvg || 0) - (a.ratingAvg || 0);
    if (rating) return rating;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function nextOffer(providers, booking, busyIds) {
  const skipped = declinedSet(booking);
  const ranked = rankProviders(providers).filter(
    (p) =>
      !skipped.has(p.id) &&
      !busyIds.has(p.id) &&
      offersService(p, booking.serviceSlug) &&
      packCovers(p) &&
      worksAt(p, booking.scheduledDate, booking.slot)
  );
  return ranked[0] || null;
}

export function fallbackProvider(providers, booking, busyIds) {
  const skipped = declinedSet(booking);
  return (providers || []).find(
    (p) =>
      p.fallback &&
      p.active &&
      !skipped.has(p.id) &&
      !busyIds.has(p.id) &&
      offersService(p, booking.serviceSlug) &&
      worksAt(p, booking.scheduledDate, booking.slot)
  ) || null;
}

function otp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function busyIdsFor(date, slot, ignoreBookingId) {
  const rows = await prisma.serviceBooking.findMany({
    where: {
      scheduledDate: date,
      slot,
      status: { in: BUSY },
      ...(ignoreBookingId ? { id: { not: ignoreBookingId } } : {}),
    },
    select: { providerId: true, offerProviderId: true },
  });
  const ids = new Set();
  for (const row of rows) {
    if (row.providerId) ids.add(row.providerId);
    if (row.offerProviderId) ids.add(row.offerProviderId);
  }
  return ids;
}

async function eligibleProviders() {
  return prisma.serviceProvider.findMany({
    where: { active: true, user: { active: true, pendingApproval: false } },
    include: { user: true },
  });
}

function rememberDecline(booking, providerId) {
  const ids = declinedSet(booking);
  if (providerId) ids.add(providerId);
  return [...ids].join(",");
}

async function acceptOn(booking, provider) {
  return prisma.serviceBooking.update({
    where: { id: booking.id },
    data: {
      status: "accepted",
      providerId: provider.id,
      offerProviderId: null,
      offerExpiresAt: null,
      partnerName: provider.user?.name || provider.phone,
      startOtp: booking.startOtp || otp(),
    },
  });
}

export async function offerBooking(bookingId) {
  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!booking || !["finding", "offered"].includes(booking.status)) return booking;
  const providers = await eligibleProviders();
  const busy = await busyIdsFor(booking.scheduledDate, booking.slot, booking.id);
  const next = nextOffer(providers, booking, busy);
  if (next) {
    return prisma.serviceBooking.update({
      where: { id: booking.id },
      data: {
        status: "offered",
        offerProviderId: next.id,
        offerExpiresAt: new Date(Date.now() + ACCEPT_WINDOW_MS),
        providerId: null,
      },
    });
  }
  const desk = fallbackProvider(providers, booking, busy);
  if (desk) return acceptOn(booking, desk);
  return prisma.serviceBooking.update({
    where: { id: booking.id },
    data: { status: "unassigned", offerProviderId: null, offerExpiresAt: null, providerId: null },
  });
}

export async function tickOffers(now = new Date()) {
  const due = await prisma.serviceBooking.findMany({
    where: { status: "offered", offerExpiresAt: { lt: now } },
  });
  for (const booking of due) {
    await prisma.serviceBooking.update({
      where: { id: booking.id },
      data: {
        status: "finding",
        declinedIds: rememberDecline(booking, booking.offerProviderId),
        offerProviderId: null,
        offerExpiresAt: null,
      },
    });
    await offerBooking(booking.id);
  }
  return due.length;
}

export async function declineOffer(booking, providerId) {
  await prisma.serviceBooking.update({
    where: { id: booking.id },
    data: {
      status: "finding",
      declinedIds: rememberDecline(booking, providerId),
      offerProviderId: null,
      offerExpiresAt: null,
    },
  });
  return offerBooking(booking.id);
}

export async function acceptOffer(booking, provider) {
  return acceptOn(booking, provider);
}

export async function slotAvailability(serviceSlug, date, now = new Date()) {
  const providers = (await eligibleProviders()).filter(
    (p) => offersService(p, serviceSlug) && packCovers(p, now)
  );
  const bookings = await prisma.serviceBooking.findMany({
    where: { scheduledDate: date, status: { in: BUSY } },
    select: { slot: true, providerId: true, offerProviderId: true, status: true, scheduledDate: true },
  });
  return HOME_SERVICE_SLOTS.map((slot) => {
    const free = providers.filter((p) => worksAt(p, date, slot) && !isBusy(p.id, bookings, date, slot));
    return { slot, freeCount: free.length };
  });
}

export async function slotIsOpen(serviceSlug, date, slot) {
  const rows = await slotAvailability(serviceSlug, date);
  const hit = rows.find((r) => r.slot === slot);
  return !!hit && hit.freeCount > 0;
}
