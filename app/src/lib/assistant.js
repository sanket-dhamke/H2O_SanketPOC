import { api } from "./api";
import { answerFromHelp } from "./helpGuide";
import { findHomeService, HOME_SERVICE_SLOTS, inr as svcInr } from "./homeServices";
import { isPreschool } from "./org";

const inr = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const RESIDENT = [
  { id: "pay_bill", label: "Pay maintenance", keywords: ["pay", "bill", "due", "dues", "outstanding", "owe", "owed", "pending", "maintenance", "fee", "fees", "payment", "receipt"], route: "Maintenance", params: { screen: "MaintenanceHome" } },
  { id: "view_visitors", label: "Open visitors", keywords: ["visitor", "visited", "visitors", "guest", "who came", "who is at", "delivery", "approve", "at the gate", "flat"], route: "Visitors", params: { screen: "VisitorsHome" } },
  { id: "gate_pass", label: "Create gate pass", keywords: ["gate pass", "gatepass", "pre-approve", "preapprove", "expecting", "invite"], route: "Visitors", params: { screen: "GatePass" } },
  { id: "vehicles", label: "Vehicle passes", keywords: ["parking", "number plate", "resident vehicle"], route: "Visitors", params: { screen: "Vehicles" } },
  { id: "book_amenity", label: "Book clubhouse", keywords: ["clubhouse", "club house", "hall", "amenity", "party"], route: "Community", params: { screen: "Amenities" } },
  { id: "raise_ticket", label: "Open helpdesk", keywords: ["complaint", "complain", "ticket", "repair", "leak", "broken", "helpdesk", "issue"], route: "Community", params: { screen: "Helpdesk" } },
  { id: "call_security", label: "Call security", keywords: ["call security", "guard", "watchman", "directory"], route: "Community", params: { screen: "Directory" } },
  { id: "sos", label: "Emergency SOS", keywords: ["sos", "emergency", "ambulance", "fire alarm", "danger"], route: "Community", params: { screen: "Sos" } },
  { id: "marketplace", label: "Open Buy & Sell", keywords: ["buy", "sell", "marketplace", "second hand", "listing"], route: "Community", params: { screen: "Marketplace" } },
  { id: "home_services", label: "Home services", keywords: ["clean", "cleaning", "plumber", "electrician", "carpenter", "carpentry", "ac service", "aircon", "air con", "painting", "painter", "packer", "mover", "packers", "movers", "salon", "pest", "laundry", "interior", "home service", "home services"], route: "Community", params: { screen: "HomeServices" } },
  { id: "workers", label: "Trusted helpers", keywords: ["maid", "helper", "vendor", "cook", "nanny"], route: "Community", params: { screen: "Workers" } },
  { id: "transparency", label: "Transparency", keywords: ["transparency", "where money", "expense", "spend", "ledger"], route: "Maintenance", params: { screen: "Transparency" } },
  { id: "agm", label: "AGM & voting", keywords: ["agm", "vote", "voting", "motion", "minutes"], route: "Community", params: { screen: "Agm" } },
  { id: "sustainability", label: "Sustainability", keywords: ["green score", "water meter", "sustainability", "electricity"], route: "Maintenance", params: { screen: "Sustainability" } },
];

const ADMIN = [
  { id: "finance", label: "Open finances", keywords: ["collect", "due", "dues", "finance", "balance", "pending", "money", "revenue", "owe"], route: "Finance", params: { screen: "FinanceHome" } },
  { id: "import_csv", label: "Bulk import", keywords: ["csv", "import", "bulk", "excel", "spreadsheet"], route: "Members", params: { screen: "Onboarding" } },
  { id: "members", label: "Manage members", keywords: ["member", "resident", "user", "flat", "add account"], route: "Members", params: { screen: "ManageUsers" } },
  { id: "gate_log", label: "Open gate log", keywords: ["visitor", "visited", "gate", "entry", "log", "who came"], route: "Visitors" },
  { id: "helpdesk", label: "Open helpdesk", keywords: ["complaint", "ticket", "helpdesk"], route: "Community", params: { screen: "Helpdesk" } },
  { id: "manager", label: "Society manager", keywords: ["notice", "announce", "draft", "reminder"], route: "Finance", params: { screen: "Manager" } },
  { id: "sos", label: "Emergency SOS", keywords: ["sos", "emergency"], route: "Community", params: { screen: "Sos" } },
];

const GUARD = [
  { id: "log_visitor", label: "Log a visitor", keywords: ["log", "add visitor", "new visitor", "entry", "arriv", "came"], route: "Gate" },
  { id: "gate_log", label: "Open gate log", keywords: ["list", "log", "today", "pending", "who", "visitor", "visited"], route: "Visitors" },
  { id: "sos", label: "Emergency SOS", keywords: ["sos", "emergency"], route: "Community", params: { screen: "Sos" } },
];

function catalogue(role, user) {
  const preschool = isPreschool(user);
  if (role === "admin") {
    return preschool
      ? ADMIN.map((a) => (a.id === "manager" ? { ...a, label: "School manager" } : a.id === "members" ? { ...a, label: "Manage accounts" } : a))
      : ADMIN;
  }
  if (role === "guard") return GUARD;
  if (preschool) {
    return RESIDENT.filter((a) => !["home_services", "agm", "sustainability", "vehicles"].includes(a.id)).map((a) => {
      if (a.id === "pay_bill") return { ...a, label: "Pay fees" };
      if (a.id === "book_amenity") return { ...a, label: "Book hall" };
      return a;
    });
  }
  return RESIDENT;
}

export function normalizeQuestion(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/maintain[a-z]*/g, "maintenance")
    .replace(/\bvisitted\b|\bvisitied\b|\bvisitted\b/g, "visited")
    .replace(/\bvechile\b|\bvehical\b|\bvehicel\b/g, "vehicle")
    .replace(/\bdividied\b|\bdiveded\b/g, "divided")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchIntent(question, role, user) {
  const q = normalizeQuestion(question);
  let best = null;
  let bestScore = 0;
  for (const action of catalogue(role, user)) {
    const score = action.keywords.reduce((sum, kw) => (q.includes(kw) ? sum + kw.length : sum), 0);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  if (!best || bestScore === 0) return null;
  return { id: best.id, label: best.label, route: best.route, params: best.params || null };
}

function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function prettyDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function visitorWhen(v) {
  const raw = v.createdAt || v.at || v.enteredAt || v.decidedAt;
  const d = raw ? new Date(raw) : null;
  return d && !isNaN(d.getTime()) ? d : null;
}

function plateKey(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function extractPlate(question) {
  const compact = String(question || "").toUpperCase().replace(/[\s-]/g, "");
  const m = compact.match(/[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}/);
  return m ? m[0] : null;
}

function extractPersonName(question) {
  const m = String(question || "").match(
    /(?:named|name(?:d)?\s+is|called|name\s+of)\s+([A-Za-z][A-Za-z.'-]+)(?:\s+([A-Za-z][A-Za-z.'-]+))?/i
  );
  if (!m) return null;
  const stop = /^(visited|visit|came|come|this|last|today|yesterday|my|the|a|an|with|for|from|to|at)$/i;
  const last = m[2] && !stop.test(m[2]) ? ` ${m[2]}` : "";
  return `${m[1]}${last}`.trim();
}

function dateWindow(q) {
  const now = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (/last\s*week|past\s*week|previous\s*week/.test(q)) {
    const start = startOf(now);
    start.setDate(start.getDate() - 7);
    return { start, end: now, label: "last week" };
  }
  if (/this\s*week/.test(q)) {
    const start = startOf(now);
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    return { start, end: now, label: "this week" };
  }
  if (/last\s*month|previous\s*month/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { start, end, label: "last month" };
  }
  if (/this\s*month/.test(q)) {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: "this month" };
  }
  if (/\byesterday\b/.test(q)) {
    const start = startOf(now);
    start.setDate(start.getDate() - 1);
    return { start, end: startOf(now), label: "yesterday" };
  }
  if (/\btoday\b/.test(q)) {
    return { start: startOf(now), end: now, label: "today" };
  }
  return null;
}

function formatVisitorLine(v) {
  const when = visitorWhen(v);
  const bits = [v.name || "Someone"];
  if (v.purpose) bits.push(v.purpose);
  if (v.vehicleNo) bits.push(v.vehicleNo);
  if (v.status) bits.push(String(v.status).replace(/_/g, " "));
  if (when) bits.push(prettyDate(when));
  return bits.join(" · ");
}

function listVisitors(rows, limit = 5) {
  return rows.slice(0, limit).map((v) => `• ${formatVisitorLine(v)}`).join("\n");
}

function parseBookingDate(q) {
  const now = new Date();
  if (/\btomorrow\b/.test(q)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (/\btoday\b/.test(q)) return now;
  return null;
}

function parseBookingSlot(q) {
  const mer = q.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  let hour = null;
  if (mer) {
    hour = Number(mer[1]) % 12;
    if (/pm/i.test(mer[3])) hour += 12;
  } else if (/\bmorning\b/.test(q)) {
    hour = 10;
  } else if (/\bafternoon\b/.test(q)) {
    hour = 14;
  } else if (/\bevening\b/.test(q)) {
    hour = 18;
  }
  if (hour == null) return HOME_SERVICE_SLOTS[0];
  const start = HOME_SERVICE_SLOTS.map((s) => Number(s.slice(0, 2)));
  let best = HOME_SERVICE_SLOTS[0];
  let dist = 99;
  HOME_SERVICE_SLOTS.forEach((slot, i) => {
    const d = Math.abs(start[i] - hour);
    if (d < dist) {
      dist = d;
      best = slot;
    }
  });
  return best;
}

function detectServiceSlug(q) {
  if (/\bac\b|air\s*con|aircon|split ac|appliance/.test(q)) return "ac";
  if (/plumb/.test(q)) return "trades";
  if (/electric/.test(q)) return "instant";
  if (/clean|deep clean|sofa shampoo/.test(q)) return "cleaning";
  if (/paint/.test(q)) return "painting";
  if (/pest|cockroach|termite/.test(q)) return "pest";
  if (/laundry|wash & fold|dry clean/.test(q)) return "laundry";
  if (/mover|packer|shifting/.test(q)) return "movers";
  if (/salon|spa|wax/.test(q)) return "salon";
  return null;
}

function wantsBillSplit(q) {
  return /divid|split|break\s*down|breakdown|heads?|how .{0,20}(bill|maintenance).{0,20}(calculat|made|work)/.test(q);
}

function wantsPendingAmount(q) {
  return /(how much|what(?:'s| is)|pending|outstanding|owe|due|unpaid).{0,40}(maintenance|bill|fee|due|pending|outstanding|owe)|maintenance.{0,20}(pending|due|owe|outstanding)/.test(
    q
  );
}

function wantsVisitorLookup(q) {
  return (
    /who (visited|came|was at)|visited my|anyone (named|called)|\bvisitors?\b|\bguest\b|vehicle|number plate|at the gate|gate (log|entr)/.test(
      q
    ) && !/gate ?pass|pre-?approve|gatemate|gatezo/.test(q)
  );
}

function wantsServiceBook(q) {
  return /\b(book|schedule|arrange|fix)\b/.test(q) && detectServiceSlug(q);
}

function ok(reply, action) {
  return { reply, action, autoOpen: false, source: "app", preferLocal: true };
}

async function loadVisitors() {
  const data = await api.visitors();
  return data.visitors || data || [];
}

async function answerBills(q, role) {
  if (role === "admin") {
    const ins = await api.adminInsights().catch(() => null);
    const f = ins?.finance;
    if (f) {
      return ok(
        `This month: collected ${inr(f.collectedThisMonth)}, still pending ${inr(f.pendingThisMonth || f.pendingTotal)}. Tap below to open finances.`,
        { id: "finance", label: "Open finances", route: "Finance", params: { screen: "FinanceHome" } }
      );
    }
  }

  const { bills = [], totalDue = 0 } = await api.maintenance();
  const dueOf = (b) => (b.balance != null ? b.balance : b.amountDue != null ? b.amountDue : b.amount || 0);
  const open = (bills || []).filter((b) => (b.status || "") !== "paid" && dueOf(b) > 0);
  const action = { id: "pay_bill", label: "Pay maintenance", route: "Maintenance", params: { screen: "MaintenanceHome" } };

  if (wantsBillSplit(q)) {
    const sample = open[0] || bills[0];
    const heads = sample?.breakdown;
    if (heads?.length) {
      const lines = heads.map((h) => `• ${h.head || h.name}: ${inr(h.amount)}`).join("\n");
      return ok(
        `Your society bill is the sum of maintenance heads the committee set:\n${lines}\nTotal ${inr(sample.amount)}. Rented flats can have a different amount. Late fee applies after the due date if the policy is on.`,
        action
      );
    }
    return ok(
      "The committee sets monthly maintenance as a list of heads (security, water, sinking fund, etc.) that add up to one amount per flat. Rented flats can use an override. Late fee is added only after the due date plus any grace days. Open your bill to see the amount for each period — a line-by-line split appears when the office billed from heads.",
      action
    );
  }

  if (!open.length && totalDue < 0.5) {
    return ok("You're fully paid up — nothing outstanding on your flat right now. Tap below if you want receipts.", action);
  }

  const lines = open.slice(0, 4).map((b) => {
    const amt = dueOf(b);
    const due = b.dueDate ? `, due ${b.dueDate}` : "";
    return `• ${b.period || "Bill"}: ${inr(amt)}${due}`;
  });
  const extra = open.length > 4 ? `\n…and ${open.length - 4} more.` : "";
  const pending = totalDue || open.reduce((s, b) => s + dueOf(b), 0);
  return ok(
    `Pending maintenance on your flat is ${inr(pending)}.\n${lines.join("\n")}${extra}`,
    action
  );
}

async function answerVisitors(q, question) {
  const visitors = await loadVisitors();
  const list = Array.isArray(visitors) ? visitors : [];
  const action = { id: "view_visitors", label: "Open visitors", route: "Visitors", params: { screen: "VisitorsHome" } };
  const window = dateWindow(q);
  const plate = extractPlate(question);
  const name = extractPersonName(question);
  let rows = list;

  if (window) {
    rows = rows.filter((v) => {
      const t = visitorWhen(v);
      return t && t >= window.start && t <= window.end;
    });
  }

  if (plate) {
    const key = plateKey(plate);
    const hits = list.filter((v) => plateKey(v.vehicleNo).includes(key) || key.includes(plateKey(v.vehicleNo)));
    if (!hits.length) {
      return ok(`No gate entry on your flat with vehicle ${plate}. I checked the visitor log.`, action);
    }
    return ok(
      `${hits.length === 1 ? "Yes — 1 visit" : `Yes — ${hits.length} visits`} with ${plate}:\n${listVisitors(hits)}`,
      action
    );
  }

  if (name) {
    const needle = name.toLowerCase();
    const scoped = (window ? rows : list).filter((v) => String(v.name || "").toLowerCase().includes(needle));
    const period = window ? ` ${window.label}` : "";
    if (!scoped.length) {
      return ok(`No — nobody named ${name} visited your flat${period}.`, action);
    }
    return ok(
      `Yes — ${scoped.length} visit${scoped.length === 1 ? "" : "s"} by ${name}${period}:\n${listVisitors(scoped)}`,
      action
    );
  }

  if (window) {
    if (!rows.length) {
      return ok(`Nobody visited your flat ${window.label}.`, action);
    }
    return ok(`${rows.length} visit${rows.length === 1 ? "" : "s"} ${window.label}:\n${listVisitors(rows)}`, action);
  }

  const waiting = list.filter((v) => v.status === "pending");
  if (waiting.length) {
    return ok(
      `${waiting.length} waiting at the gate:\n${listVisitors(waiting, 3)}\nTap below to approve or deny.`,
      action
    );
  }
  if (!list.length) {
    return ok("No visitors on your flat in the recent log.", action);
  }
  return ok(`${list.length} recent gate ${list.length === 1 ? "entry" : "entries"}:\n${listVisitors(list)}`, action);
}

function answerBooking(q) {
  const slug = detectServiceSlug(q);
  const service = findHomeService(slug);
  if (!service) return null;
  const when = parseBookingDate(q);
  const slot = parseBookingSlot(q);
  const date = when ? isoDate(when) : null;
  const pack = service.packages?.[0];
  const dayLabel = when
    ? when.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
    : "your chosen date";
  const price = pack ? ` Packages start at ${svcInr(pack.price)}.` : "";
  return ok(
    `I can set up ${service.name} for ${dayLabel}, ${slot} (closest morning/afternoon window we offer).${price} I won't place the booking until you confirm the package on the next screen.`,
    {
      id: "home_services",
      label: `Book ${service.name.split("&")[0].trim()}`,
      route: "Community",
      params: { screen: "HomeServiceDetail", params: { slug: service.slug, date: date || undefined, slot } },
    }
  );
}

async function groundedReply(action, role, q, question) {
  try {
    if (action?.id === "pay_bill" || (action?.id === "finance" && role === "admin")) {
      const billed = await answerBills(q, role);
      if (billed) return billed.reply;
    }
    if (action?.id === "view_visitors" || action?.id === "gate_log") {
      const vis = await answerVisitors(q, question);
      if (vis) return vis.reply;
    }
    if (action?.id === "home_services") {
      const booked = answerBooking(q);
      if (booked) return booked.reply;
    }
    if (action?.id === "call_security") {
      const data = await api.helpdeskContacts().catch(() => ({}));
      const contacts = data.contacts || data.guards || data || [];
      const list = Array.isArray(contacts) ? contacts : [];
      const guard = list.find((c) => /guard|security/i.test(c.role || c.title || "")) || list[0];
      if (guard?.name) {
        return `Your gate contact is ${guard.name}${guard.phone ? ` on ${guard.phone}` : ""}. Tap below to open the directory.`;
      }
      return "Tap below to open the directory so you can call security or the office.";
    }
  } catch {
    /* generic line */
  }
  return action ? `Sure — I can open ${action.label.toLowerCase()} when you tap the button below.` : null;
}

export async function resolveAssistant(question, userOrRole) {
  const user = typeof userOrRole === "string" ? { role: userOrRole } : userOrRole || {};
  const role = user.role;
  const q = normalizeQuestion(question);

  try {
    if (wantsServiceBook(q)) {
      const booked = answerBooking(q);
      if (booked) return booked;
    }
    if (wantsBillSplit(q) || wantsPendingAmount(q)) {
      return await answerBills(q, role);
    }
    if (extractPlate(question) || extractPersonName(question) || wantsVisitorLookup(q)) {
      return await answerVisitors(q, question);
    }
  } catch {
    /* fall through to help / keywords */
  }

  try {
    if (/transparency|where (the )?money|tamper|ledger/.test(q)) {
      const r = await api.transparency().catch(() => null);
      const t = r?.transparency || r;
      if (t?.score != null) {
        return ok(
          `Transparency Score is ${t.score}/100 (${t.band || "—"}). We capture it from the real books: every payment in and labelled expense out is sealed on a hash-chained ledger${t.integrity?.ok ? ` (${t.integrity.count} verified entries)` : " — the chain needs a re-seal"}. Collected ${inr(t.totals?.collected)}, spent ${inr(t.totals?.expenses)}. The six factors on that tab show exactly why the number is what it is.`,
          { id: "transparency", label: "Open Transparency", route: "Maintenance", params: { screen: "Transparency" } }
        );
      }
    }
    if (/sustainab|green score|water (use|meter|reading)|litres/.test(q)) {
      const s = await api.sustainability().catch(() => null);
      if (s?.societyScore != null) {
        const mine =
          s.mine?.litres != null
            ? ` Your flat: ${Number(s.mine.litres).toLocaleString("en-IN")} L this month (score ${s.mine.score}).`
            : " Your flat has no reading yet — ask the office to enter this month’s meter.";
        return ok(
          `Community green score is ${s.societyScore}/100 for ${s.period}. We capture it from monthly water-meter readings (admin tap + or CSV), then compare each flat with the median (${Number(s.median || 0).toLocaleString("en-IN")} L). 100 = very low use, 50 = at the median.${mine} This does not change your maintenance bill.`,
          { id: "sustainability", label: "Open Sustainability", route: "Maintenance", params: { screen: "Sustainability" } }
        );
      }
    }
  } catch {
    /* help text still covers these tabs */
  }

  const help = answerFromHelp(question, user);
  if (help) {
    const trans = /transparency|ledger|where money/.test(q);
    const green = /sustainab|green score|water meter/.test(q);
    const action = trans
      ? { id: "transparency", label: "Open Transparency", route: "Maintenance", params: { screen: "Transparency" } }
      : green
        ? { id: "sustainability", label: "Open Sustainability", route: "Maintenance", params: { screen: "Sustainability" } }
        : { id: "help", label: "Open Help", route: "Community", params: { screen: "Help" } };
    return ok(help, action);
  }

  const action = matchIntent(question, role, user);
  const reply = action
    ? await groundedReply(action, role, q, question)
    : "I can look up bills, visitors (by name, date or vehicle), bookings, helpdesk, or how a feature works — try “how much maintenance is pending” or “who visited last week”.";
  return {
    reply,
    action,
    autoOpen: false,
    source: "app",
    preferLocal: true,
  };
}

export function looksLikeAiFailure(text) {
  return /ai request failed|request failed|please try again|404|502|503/i.test(String(text || ""));
}
