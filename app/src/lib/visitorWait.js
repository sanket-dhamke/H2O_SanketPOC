// How long a resident has to answer a visitor at the gate. After this, the
// entry is no longer "Waiting". A guest stays "No response" until the guard
// calls the flat and, if they let the person in, records a reason. A delivery
// or cab is left at the gate or sent back, and is not sent upstairs.

export const VISITOR_WAIT_MS = 3 * 60 * 1000;
export const VISITOR_CALL_AFTER_MS = 60 * 1000;

export function isParcelVisit(purpose) {
  const p = String(purpose || "").toLowerCase();
  return p.includes("deliver") || p.includes("cab");
}

export function visitorWaitState(visitor, now = Date.now()) {
  if (!visitor || visitor.status !== "pending") {
    return { status: visitor?.status || "", waitMsLeft: 0 };
  }
  const created = new Date(visitor.createdAt).getTime();
  const age = Number.isFinite(created) ? now - created : 0;
  if (age >= VISITOR_WAIT_MS) return { status: "no_response", waitMsLeft: 0 };
  return { status: "pending", waitMsLeft: VISITOR_WAIT_MS - age };
}

// A camera photo stored inline can be hundreds of kilobytes. The gate log
// only needs a normal web address, and shows initials otherwise.
export function listVisitor(visitor) {
  if (!visitor) return visitor;
  const photo = typeof visitor.photo === "string" && /^https?:\/\//.test(visitor.photo) ? visitor.photo : null;
  if (photo === (visitor.photo || null) && photo === (visitor.photoUrl || null)) return visitor;
  return { ...visitor, photo, photoUrl: photo };
}

// The live gate API may still say "pending" after the 3 minutes. The screen
// treats that as No response so a missed visit does not stay on Waiting.
export function presentVisitor(visitor, now = Date.now()) {
  if (!visitor) return visitor;
  const next = visitorWaitState(visitor, now);
  if (next.status === visitor.status) return { ...visitor, waitMsLeft: next.waitMsLeft };
  return { ...visitor, status: next.status, waitMsLeft: 0 };
}

// The hosted gate API can only store approved, rejected, or left at the gate.
// A guard close made through that API is remembered here so the log still says
// Allowed by guard or Sent back, including the reason they typed.
export function applyGuardMemory(visitor, memory) {
  if (!visitor || !memory) return visitor;
  const saved = memory[visitor.id];
  if (!saved) return visitor;
  if (visitor.status === "allowed_by_guard" || visitor.status === "sent_back") return visitor;
  if (saved.status === "allowed_by_guard" && visitor.status === "approved") {
    return { ...visitor, status: "allowed_by_guard", decisionNote: saved.decisionNote || visitor.decisionNote || null };
  }
  if (saved.status === "sent_back" && visitor.status === "rejected") {
    return { ...visitor, status: "sent_back" };
  }
  return visitor;
}

export function validateGuardAction(visitor, action, reason, now = Date.now()) {
  if (!visitor) return { ok: false, message: "Visitor not found." };
  if (visitor.status !== "pending" && visitor.status !== "no_response") {
    return { ok: false, message: "This visit is already decided." };
  }
  const open = visitor.status === "no_response" || visitorWaitState(visitor, now).status === "no_response";
  if (!open) return { ok: false, message: "The resident still has time to answer." };

  if (action === "allow") {
    if (isParcelVisit(visitor.purpose)) {
      return { ok: false, message: "A delivery or cab is not sent up. Leave it at the gate or send it back." };
    }
    const note = String(reason || "").trim();
    if (note.length < 3) return { ok: false, message: "Add a short reason for letting them in." };
    return { ok: true, status: "allowed_by_guard", decisionNote: note };
  }
  if (action === "leave_at_gate") {
    if (!isParcelVisit(visitor.purpose)) {
      return { ok: false, message: "Only a delivery or cab is left at the gate." };
    }
    return { ok: true, status: "leave_at_gate", decisionNote: "" };
  }
  if (action === "send_back") {
    return { ok: true, status: "sent_back", decisionNote: "" };
  }
  return { ok: false, message: "Unknown action." };
}
