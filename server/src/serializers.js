// Shapes DB records into the public JSON the app expects. Keeps flatNo available
// for display even though flats are now a separate relation.

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || null,
    role: u.role,
    societyId: u.societyId || null,
    societyName: u.society?.name || null,
    societyCity: u.society?.city || null,
    societyAddress: u.society?.address || null,
    flatId: u.flatId || null,
    flatNo: u.flat?.flatNo || null,
    block: u.flat?.block || null,
    notifyEnabled: u.notifyEnabled ?? true,
    active: u.active,
    // Subscription plan of the user's society (so the app can gate premium perks).
    societyPlan: u.society?.plan || null,
    societyPlanExpiresAt: u.society?.planExpiresAt || null,
  };
}

export function serializeVenueBooking(v) {
  return {
    id: v.id,
    venueName: v.venueName,
    vendorName: v.vendorName,
    vendorPhone: v.vendorPhone || null,
    vendorEmail: v.vendorEmail || null,
    purpose: v.purpose || null,
    date: v.date,
    slot: v.slot,
    amount: v.amount,
    platformFeePct: v.platformFeePct,
    platformFee: v.platformFee,
    societyNet: v.societyNet,
    status: v.status,
    paymentRef: v.paymentRef || null,
    paidAt: v.paidAt,
    notes: v.notes || null,
    createdAt: v.createdAt,
  };
}

export function serializeVisitor(v) {
  return {
    id: v.id,
    name: v.name,
    phone: v.phone || "",
    vehicleNo: v.vehicleNo || "",
    purpose: v.purpose || "Visitor",
    // "photo" keeps the app's existing field name working.
    photo: v.photoUrl || null,
    photoUrl: v.photoUrl || null,
    flatId: v.flatId,
    flatNo: v.flat?.flatNo || null,
    guardId: v.guardId || null,
    status: v.status,
    createdAt: v.createdAt,
    decidedAt: v.decidedAt,
  };
}

export function serializeBill(b) {
  return {
    id: b.id,
    flatId: b.flatId,
    flatNo: b.flat?.flatNo || null,
    period: b.period,
    amount: b.amount,
    dueDate: b.dueDate,
    status: b.status,
    paidAt: b.paidAt,
    paymentRef: b.paymentRef || null,
    paymentMode: b.paymentMode || null,
    collectedBy: b.collectedBy || null,
    collectorPhone: b.collectorPhone || null,
  };
}

export function serializeAnnouncement(a) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    pinned: a.pinned,
    authorName: a.authorName || null,
    createdAt: a.createdAt,
  };
}

export function serializePost(p) {
  return {
    id: p.id,
    category: p.category,
    title: p.title,
    body: p.body,
    price: p.price ?? null,
    authorId: p.authorId,
    authorName: p.author?.name || null,
    flatNo: p.author?.flat?.flatNo || null,
    createdAt: p.createdAt,
  };
}

export function serializeSlot(s) {
  return {
    id: s.id,
    label: s.label,
    startTime: s.startTime || null,
    endTime: s.endTime || null,
    price: s.price,
    active: s.active,
  };
}

export function serializeAmenity(a) {
  return {
    id: a.id,
    name: a.name,
    description: a.description || null,
    enabled: a.enabled,
    slots: (a.slots || []).map(serializeSlot),
  };
}

export function serializeBooking(b) {
  return {
    id: b.id,
    amenityId: b.amenityId,
    amenityName: b.amenity?.name || null,
    slotId: b.slotId,
    slotLabel: b.slot?.label || null,
    date: b.date,
    status: b.status,
    amount: b.amount,
    notes: b.notes || null,
    paymentRef: b.paymentRef || null,
    paidAt: b.paidAt,
    residentId: b.residentId,
    residentName: b.resident?.name || null,
    flatNo: b.resident?.flat?.flatNo || null,
    createdAt: b.createdAt,
  };
}
