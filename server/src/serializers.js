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
    flatId: u.flatId || null,
    flatNo: u.flat?.flatNo || null,
    active: u.active,
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
  };
}
