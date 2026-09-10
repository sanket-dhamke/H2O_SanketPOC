// Client-side intent matching. Used when the live API does not yet have
// POST /api/ai/act (that 404s on the currently deployed Render service) or when
// Groq is down. Same catalogue as the server, so "I want to pay my bill" still
// opens Maintenance.

const RESIDENT = [
  { id: "pay_bill", label: "Pay maintenance", keywords: ["pay", "bill", "due", "dues", "outstanding", "maintenance", "fee", "fees", "payment", "receipt"], route: "Maintenance", params: { screen: "MaintenanceHome" } },
  { id: "view_visitors", label: "Open visitors", keywords: ["visitor", "visited", "guest", "gate", "delivery", "approve", "who came"], route: "Visitors", params: { screen: "VisitorsHome" } },
  { id: "gate_pass", label: "Create gate pass", keywords: ["gate pass", "gatepass", "pre-approve", "preapprove", "expecting", "invite"], route: "Visitors", params: { screen: "GatePass" } },
  { id: "book_amenity", label: "Book clubhouse", keywords: ["book", "booking", "clubhouse", "club house", "hall", "amenity", "slot", "party"], route: "Community", params: { screen: "Amenities" } },
  { id: "raise_ticket", label: "Open helpdesk", keywords: ["complaint", "complain", "ticket", "repair", "helpdesk", "issue"], route: "Community", params: { screen: "Helpdesk" } },
  { id: "call_security", label: "Call security", keywords: ["call", "security", "guard", "watchman"], route: "Community", params: { screen: "Directory" } },
  { id: "sos", label: "Emergency SOS", keywords: ["sos", "emergency", "urgent", "ambulance", "fire"], route: "Community", params: { screen: "Sos" } },
  { id: "import_csv", label: "Import members", keywords: ["csv", "import", "spreadsheet", "bulk"], route: "Members", params: { screen: "Onboarding" } },
];

const ADMIN = [
  { id: "finance", label: "Open finances", keywords: ["collect", "due", "dues", "finance", "balance", "pending", "money"], route: "Finance", params: { screen: "FinanceHome" } },
  { id: "import_csv", label: "Bulk import", keywords: ["csv", "import", "bulk", "excel", "spreadsheet"], route: "Members", params: { screen: "Onboarding" } },
  { id: "members", label: "Manage members", keywords: ["member", "resident", "user", "flat"], route: "Members", params: { screen: "ManageUsers" } },
  { id: "gate_log", label: "Open gate log", keywords: ["visitor", "gate", "entry", "log"], route: "Visitors" },
  { id: "helpdesk", label: "Open helpdesk", keywords: ["complaint", "ticket", "helpdesk"], route: "Community", params: { screen: "Helpdesk" } },
];

const GUARD = [
  { id: "log_visitor", label: "Log a visitor", keywords: ["log", "add visitor", "new visitor", "entry", "arriv"], route: "Gate" },
  { id: "gate_log", label: "Open gate log", keywords: ["list", "log", "today", "pending", "who"], route: "Visitors" },
];

function catalogue(role) {
  if (role === "admin") return ADMIN;
  if (role === "guard") return GUARD;
  return RESIDENT;
}

export function localIntent(question, role) {
  const q = String(question || "").toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const action of catalogue(role)) {
    const score = action.keywords.reduce((sum, kw) => (q.includes(kw) ? sum + kw.length : sum), 0);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  if (!best) return null;
  return { id: best.id, label: best.label, route: best.route, params: best.params || null };
}

export function localActReply(question, role) {
  const action = localIntent(question, role);
  if (!action) {
    return {
      reply: "I couldn't reach the assistant just now. Use the groups below — Bills, Gate, Community — or try again in a moment.",
      action: null,
      source: "local",
    };
  }
  return {
    reply: `Sure — opening ${action.label.toLowerCase()}.`,
    action,
    source: "local",
  };
}
