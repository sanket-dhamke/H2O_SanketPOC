import OpenAI from "openai";
import { prisma } from "./prisma.js";
import { computeSocietyInsights } from "./insights.js";

// Provider-agnostic AI config. The OpenAI SDK talks to any OpenAI-compatible
// endpoint, so this works with OpenAI, Groq (free, open-source Llama + Whisper),
// Ollama (local), OpenRouter, Together, etc. — just by changing these env vars.
//   AI_BASE_URL         e.g. https://api.groq.com/openai/v1  (omit for OpenAI)
//   AI_API_KEY          the provider key (any non-empty value for local Ollama)
//   AI_CHAT_MODEL       e.g. llama-3.3-70b-versatile / gpt-4o-mini / llama3.1
//   AI_TRANSCRIBE_MODEL e.g. whisper-large-v3 / whisper-1
// Legacy OPENAI_* names still work as fallbacks.
const API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
const BASE_URL = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "";

// Enabled when a key is set, or when pointed at a local endpoint (Ollama needs
// no real key). A base URL alone (self-hosted) is enough to turn AI on.
export const aiEnabled = Boolean(API_KEY) || Boolean(BASE_URL);

const openai = aiEnabled
  ? new OpenAI({
      apiKey: API_KEY || "not-needed",
      ...(BASE_URL ? { baseURL: BASE_URL } : {}),
    })
  : null;

const CHAT_MODEL =
  process.env.AI_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const TRANSCRIBE_MODEL =
  process.env.AI_TRANSCRIBE_MODEL || process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";

// Voice transcription needs a Whisper-capable endpoint (OpenAI or Groq). Local
// Ollama has no audio endpoint, so callers can check this before recording.
export const transcriptionEnabled = aiEnabled && /whisper/i.test(TRANSCRIBE_MODEL);

// Model ids that providers have shut down. Requests to these always 404, so we
// skip them even when they are still named in the env — otherwise every call
// pays a wasted round-trip before the fallback kicks in.
// Groq retired both Llama ids on 2026-08-16: https://console.groq.com/docs/deprecations
const RETIRED_CHAT_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma-7b-it",
]);

// Chat models the ACTIVE provider is likely to have, tried in order. Providers
// retire model ids without notice, which turns every assistant reply into a 404
// until someone edits the env vars. Same self-healing approach as
// transcriptionCandidates() below.
function chatCandidates() {
  const isGroq = /groq/i.test(BASE_URL);
  const providerDefaults = isGroq
    ? ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"]
    : ["gpt-4o-mini", "gpt-4o"];
  const ordered = [CHAT_MODEL, ...providerDefaults].filter(Boolean);
  const live = ordered.filter((m) => !RETIRED_CHAT_MODELS.has(m));
  // If every candidate is retired we still try them, so the error is the
  // provider's own message rather than a silent empty list.
  return [...new Set(live.length ? live : ordered)];
}

// Remember the first model that worked so we don't re-try dead ones every time.
let workingChatModel = null;

// Some models/providers reject response_format: { type: "json_object" }.
const isJsonFormatUnsupported = (err) => {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("response_format") || msg.includes("json_object") || msg.includes("json mode");
};

// Every chat call goes through here so a single stale model id (or a provider
// that lacks JSON mode) degrades to the next candidate instead of failing the
// whole request. Throws only when no candidate can serve the call.
async function chatComplete(params) {
  if (!openai) throw new Error("AI is not configured");
  const models = workingChatModel
    ? [workingChatModel, ...chatCandidates().filter((m) => m !== workingChatModel)]
    : chatCandidates();

  let lastErr = null;
  for (const model of models) {
    try {
      const completion = await openai.chat.completions.create({ ...params, model });
      workingChatModel = model;
      if (model !== CHAT_MODEL) {
        console.warn(`chatComplete: configured model "${CHAT_MODEL}" unavailable, using "${model}". Set AI_CHAT_MODEL=${model} to silence this.`);
      }
      return completion;
    } catch (err) {
      lastErr = err;
      if (params.response_format && isJsonFormatUnsupported(err)) {
        const { response_format, ...rest } = params;
        try {
          const completion = await openai.chat.completions.create({ ...rest, model });
          workingChatModel = model;
          return completion;
        } catch (retryErr) {
          lastErr = retryErr;
        }
      }
      // Only fall through for "model missing"; real errors (auth, quota) rethrow.
      if (!isModelMissing(lastErr)) throw lastErr;
      console.warn(`chatComplete: model "${model}" not available on this provider, trying next…`);
    }
  }
  throw lastErr || new Error("No chat model available");
}

// Providers cap the tokens accepted per request (Groq's free tier especially).
// A large society's snapshot can exceed that cap, which reaches the user as a
// failed AI request. Halve the longest lists until the payload fits, keeping the
// most recent entries, and flag the trim so the model won't imply completeness.
const MAX_CONTEXT_CHARS = Number(process.env.AI_MAX_CONTEXT_CHARS || 24000);

function fitContext(context) {
  const shrinkable = ["visitors", "bills", "dues", "bookings", "myBookings", "collectionByMonth", "amenities"];
  let ctx = context;
  for (let pass = 0; pass < 8; pass++) {
    if (JSON.stringify(ctx).length <= MAX_CONTEXT_CHARS) return ctx;
    const next = { ...ctx, truncated: true };
    for (const key of shrinkable) {
      if (Array.isArray(next[key]) && next[key].length > 3) {
        next[key] = next[key].slice(0, Math.ceil(next[key].length / 2));
      }
    }
    ctx = next;
  }
  return ctx;
}

// Builds a compact, role-scoped snapshot of the data the assistant may reason
// over. Residents only ever see their own flat; guards/admins see the society.
async function buildContext(user) {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { flat: true, society: true },
  });

  const societyId = dbUser?.societyId || user.societyId || "__none__";
  const orgType = dbUser?.society?.orgType === "preschool" ? "preschool" : "society";
  // Contact directory: admins (chairman/office) and guards residents can reach.
  const staff = await prisma.user.findMany({
    where: { societyId, role: { in: ["admin", "guard"] }, active: true },
    select: { name: true, phone: true, role: true },
    orderBy: { role: "asc" },
  });
  const contacts = staff.map((s) => ({ name: s.name, role: s.role, phone: s.phone || null }));
  // Enabled amenities (with slots/prices) that residents can book from the Amenities tab.
  const amenities = await prisma.amenity.findMany({
    where: { societyId, enabled: true },
    include: { slots: { where: { active: true } } },
  });
  const amenitiesInfo = amenities.map((a) => ({
    name: a.name,
    slots: a.slots.map((s) => ({ label: s.label, time: [s.startTime, s.endTime].filter(Boolean).join("-"), price: s.price })),
  }));

  if (user.role === "resident") {
    const flatId = dbUser?.flatId;
    const [visitors, bills, bookings] = await Promise.all([
      prisma.visitor.findMany({ where: { flatId }, orderBy: { createdAt: "desc" }, take: 40 }),
      prisma.bill.findMany({ where: { flatId }, orderBy: { period: "desc" } }),
      prisma.booking.findMany({ where: { residentId: user.id }, include: { amenity: true, slot: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    ]);
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return {
      role: "resident",
      orgType,
      currentPeriod,
      society: { name: dbUser?.society?.name || null },
      contacts,
      flat: dbUser?.flat?.flatNo,
      visitors: visitors.map((v) => ({
        name: v.name, flatNo: dbUser?.flat?.flatNo, purpose: v.purpose, vehicleNo: v.vehicleNo, phone: v.phone,
        status: v.status, at: v.createdAt,
      })),
      bills: bills.map((b) => ({ period: b.period, amount: b.amount, status: b.status, dueDate: b.dueDate, paidAt: b.paidAt })),
      amenities: amenitiesInfo,
      myBookings: bookings.map((b) => ({
        amenity: b.amenity?.name, slot: b.slot?.label, date: b.date, status: b.status, amount: b.amount,
      })),
    };
  }

  // guard / admin: society-wide (bounded) snapshot, scoped to their society.
  const [visitors, bills, expenses, flats, bookings] = await Promise.all([
    prisma.visitor.findMany({ where: { flat: { societyId } }, include: { flat: true }, orderBy: { createdAt: "desc" }, take: 80 }),
    prisma.bill.findMany({ where: { flat: { societyId } }, include: { flat: true } }),
    prisma.expense.findMany({ where: { societyId } }),
    prisma.flat.findMany({ where: { societyId } }),
    prisma.booking.findMany({ where: { societyId }, include: { amenity: true, slot: true, resident: { include: { flat: true } } }, orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  const paidOf = (b) => (b.status === "paid" ? b.amount : b.paidAmount || 0);
  const paidBills = bills.filter((b) => paidOf(b) > 0);
  const collected = bills.reduce((s, b) => s + paidOf(b), 0);
  const pending = bills.reduce((s, b) => s + Math.max(0, (b.amount || 0) - paidOf(b)), 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // Month-aware aggregates so the assistant can answer time-based questions
  // ("this month", "in July", etc.). period is "YYYY-MM"; paidAt is a timestamp.
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const collectedThisMonth = paidBills
    .filter((b) => (b.paidAt ? new Date(b.paidAt).toISOString().slice(0, 7) : b.period) === currentPeriod)
    .reduce((s, b) => s + paidOf(b), 0);
  const byPeriodMap = {};
  for (const b of bills) {
    const p = b.period || "unknown";
    if (!byPeriodMap[p]) byPeriodMap[p] = { period: p, billed: 0, collected: 0, pending: 0 };
    byPeriodMap[p].billed += b.amount;
    byPeriodMap[p].collected += paidOf(b);
    byPeriodMap[p].pending += Math.max(0, (b.amount || 0) - paidOf(b));
  }
  const byPeriod = Object.values(byPeriodMap).sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, 12);

  return {
    role: user.role,
    orgType,
    currentPeriod,
    contacts,
    society: {
      name: dbUser?.society?.name || null,
      flats: flats.length,
      collectedThisMonth,
      collectedAllTime: collected,
      pendingAllTime: pending,
      totalExpenses,
      balance: collected - totalExpenses,
    },
    collectionByMonth: byPeriod,
    dues: flats
      .map((f) => {
        const due = bills.filter((b) => b.flatId === f.id && b.status === "pending").reduce((s, b) => s + b.amount, 0);
        return { flatNo: f.flatNo, due };
      })
      .filter((f) => f.due > 0),
    visitors: visitors.map((v) => ({
      name: v.name, flatNo: v.flat?.flatNo, purpose: v.purpose, vehicleNo: v.vehicleNo,
      status: v.status, at: v.createdAt,
    })),
    amenities: amenitiesInfo,
    bookings: bookings.map((b) => ({
      amenity: b.amenity?.name, slot: b.slot?.label, date: b.date, status: b.status,
      amount: b.amount, flatNo: b.resident?.flat?.flatNo, resident: b.resident?.name,
    })),
  };
}

// Org-aware vocabulary so the assistant speaks the right language for each
// tenant. Preschools must never hear "flat", "society" or "maintenance".
const VOCAB = {
  society: {
    org: "society", unit: "flat", units: "flats", payer: "resident",
    fees: "maintenance", feesTab: "Maintenance", place: "society",
    amenity: "clubhouse/amenity", amenityTab: "Amenities",
  },
  preschool: {
    org: "preschool", unit: "student", units: "students", payer: "parent/guardian",
    fees: "fees", feesTab: "Fees", place: "school",
    amenity: "hall", amenityTab: "Hall booking",
  },
};

// Answers a natural-language question over the role-scoped data snapshot.
export async function assistantAnswer(user, question) {
  const context = fitContext(await buildContext(user));
  const today = new Date().toISOString();
  const orgType = context.orgType === "preschool" ? "preschool" : "society";
  const v = VOCAB[orgType];

  const preschoolRule =
    orgType === "preschool"
      ? "This tenant is a PRESCHOOL. NEVER use the words 'flat', 'society' or 'maintenance'. " +
        "In the JSON, each 'flatNo' is a STUDENT (name/id), 'society' is the SCHOOL, and 'bills'/'dues' are FEES. " +
        "Always speak in terms of students, classes, the school and fees. "
      : "";

  const residentRule =
    user.role === "resident"
      ? `IMPORTANT: The data is already scoped to this user. Every entry in 'visitors', 'bills' and 'myBookings' belongs to the user's own ${v.unit} (data.flat). ` +
        `NEVER say the records are 'not linked' to their ${v.unit} — they always are. Just answer directly (e.g. list the visitors for the requested period). `
      : "";

  const truncationRule = context.truncated
    ? "NOTE: the lists in the data were shortened to fit and hold only the most recent entries, so phrase counts as 'at least N'. "
    : "";

  const completion = await chatComplete({
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          `You are GATEZO, a helpful ${v.org}-management assistant. Answer ONLY from the provided JSON data. ` +
          preschoolRule +
          residentRule +
          truncationRule +
          `Be concise and specific (dates, names, amounts in INR, formatted like ₹1,200). If the data does not contain the answer, say so. ` +
          `Money fields: society.collectedThisMonth = ${v.fees} collected in the current month (data.currentPeriod, format YYYY-MM); ` +
          "society.collectedAllTime = collected across all time; society.pendingAllTime = outstanding dues; " +
          "society.balance = collected minus expenses. collectionByMonth breaks down billed/collected/pending per month. " +
          "When the user says 'this month' use data.currentPeriod; for a named month, match it in collectionByMonth. " +
          `'contacts' lists the ${v.place}'s admins (office) and guards with their phone numbers — use it to answer ` +
          "'who is my guard/admin' and give their name and phone (say the number isn't on file if phone is null). " +
          `For paying ${v.fees}: a ${v.payer} can only pay bills that appear in 'bills' with status 'pending' or 'partial', from the '${v.feesTab}' tab. ` +
          "Paying next month or a full year in advance is NOT supported yet — if asked, explain that only bills already issued can be paid, " +
          "list their pending bills (period, amount, due date), and suggest contacting the admin to raise advance bills. " +
          `The data may include 'amenities' (bookable ${v.amenity} with slots and prices) and bookings. ` +
          `If the user asks to book a ${v.amenity}, you cannot book it yourself — tell them the available options, ` +
          `slots and prices from the data, and direct them to open the '${v.amenityTab}' tab to request a slot (admin approves, then they pay in-app). ` +
          `If the user asks how a feature works, how to use GATEZO, or what the app can do, explain it from this FEATURE GUIDE and invite them to open Help in Community:\n` +
          "Home dashboard: charts, folders, Ask GATEZO, Home Services, offers. " +
          "Visitors: approve/deny, gate pass, vehicle QR. Maintenance: pay bills and receipts. " +
          "Community: announcements, board, Helpdesk, Directory, clubhouse booking, Assistant, Help how-to. " +
          "Home Services: book cleaning/AC/trades. Buy & Sell: neighbour listings. SOS: emergency alert. " +
          "AGM: vote and minutes. Transparency: where money went. " +
          `Today is ${today}. The user's role is ${user.role}.`,
      },
      { role: "user", content: `DATA:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || "Sorry, I couldn't find an answer.";
}

// ---- Action layer: turn a spoken/typed request into an answer + a deep link ----
// The assistant should DO things, not just describe them. The model may only
// pick an id from this fixed, role-scoped catalogue, so it can never invent a
// route the app doesn't have. Keywords drive the offline fallback below.
function actionCatalogue(role, orgType) {
  const preschool = orgType === "preschool";
  const feesLabel = preschool ? "fees" : "maintenance";

  if (role === "resident") {
    return [
      { id: "pay_bill", label: preschool ? "Open fees" : "Pay maintenance", intent: `pay a bill, see ${feesLabel} owed, dues, outstanding amount, receipts`, keywords: ["pay", "bill", "due", "dues", "outstanding", "maintenance", "fee", "fees", "payment", "receipt"], route: "Maintenance", params: { screen: "MaintenanceHome" } },
      { id: "view_visitors", label: "Open gate log", intent: "see who visited, visitor history, approve or deny someone at the gate", keywords: ["visitor", "visited", "guest", "gate", "delivery", "approve", "who came"], route: "Visitors", params: { screen: "VisitorsHome" } },
      { id: "gate_pass", label: "Create gate pass", intent: "pre-approve an expected guest, delivery or cab with a code", keywords: ["gate pass", "gatepass", "pre-approve", "preapprove", "expecting", "invite"], route: "Visitors", params: { screen: "GatePass" } },
      { id: "book_amenity", label: preschool ? "Book the hall" : "Book clubhouse", intent: `book the ${preschool ? "school open hall" : "clubhouse, party hall or an amenity slot"}`, keywords: ["book", "booking", "clubhouse", "club house", "hall", "amenity", "slot", "party"], route: "Community", params: { screen: "Amenities" } },
      { id: "raise_ticket", label: "Raise a complaint", intent: "report a problem, complaint, repair or helpdesk ticket", keywords: ["complaint", "complain", "ticket", "repair", "leak", "broken", "not working", "helpdesk", "issue"], route: "Community", params: { screen: "Helpdesk" } },
      { id: "call_security", label: "Call security", intent: "call or contact the security guard, watchman or the office", keywords: ["call", "security", "guard", "watchman", "contact", "phone", "number"], route: "Community", params: { screen: "Directory" } },
      { id: "sos", label: "Emergency SOS", intent: "an emergency, needing urgent help right now", keywords: ["sos", "emergency", "urgent", "help me", "ambulance", "fire", "danger"], route: "Community", params: { screen: "Sos" } },
      { id: "marketplace", label: "Open Buy & Sell", intent: "buy or sell an item with neighbours", keywords: ["buy", "sell", "marketplace", "second hand", "listing"], route: "Community", params: { screen: "Marketplace" } },
    ];
  }

  if (role === "admin") {
    return [
      { id: "finance", label: "Open finances", intent: `collections, dues, defaulters, ${feesLabel} totals, expenses, balance`, keywords: ["collect", "due", "dues", "defaulter", "finance", "balance", "expense", "pending", "money", "revenue"], route: "Finance", params: { screen: "FinanceHome" } },
      { id: "generate_bills", label: "Generate bills", intent: "raise or generate this month's bills", keywords: ["generate", "raise bill", "create bill", "monthly bill", "issue bill"], route: "Finance", params: { screen: "FinanceHome" } },
      { id: "members", label: preschool ? "Manage students" : "Manage members", intent: `add, edit or approve ${preschool ? "students and parents" : "residents, flats and members"}`, keywords: ["member", "resident", "user", "student", "parent", "flat", "add account", "approve"], route: "Members", params: { screen: "ManageUsers" } },
      { id: "import_csv", label: "Bulk import", intent: "bulk add members or units from a CSV / spreadsheet", keywords: ["csv", "import", "bulk", "excel", "spreadsheet", "upload list"], route: "Members", params: { screen: "Onboarding" } },
      { id: "gate_log", label: "Open gate log", intent: "the visitor / gate entry log", keywords: ["visitor", "gate", "entry", "log", "who came"], route: "Visitors" },
      { id: "helpdesk", label: "Open helpdesk", intent: "resident complaints and tickets", keywords: ["complaint", "ticket", "helpdesk", "issue"], route: "Community", params: { screen: "Helpdesk" } },
      { id: "reports", label: "Open reports", intent: "reports, exports and backups", keywords: ["report", "export", "pdf", "backup"], route: "Finance", params: { screen: "Reports" } },
      { id: "manager", label: "Society manager", intent: "AI-drafted notices, reminders and monthly summaries", keywords: ["notice", "announce", "draft", "reminder", "summary"], route: "Finance", params: { screen: "Manager" } },
    ];
  }

  // guard
  return [
    { id: "log_visitor", label: "Log a visitor", intent: "record a new visitor arriving at the gate", keywords: ["log", "add visitor", "new visitor", "entry", "arriv", "came"], route: "Gate" },
    { id: "gate_log", label: "Open gate log", intent: "today's visitor list and pending approvals", keywords: ["list", "log", "today", "pending", "who"], route: "Visitors" },
    { id: "sos", label: "Emergency SOS", intent: "an emergency needing urgent help", keywords: ["sos", "emergency", "urgent", "fire", "ambulance"], route: "Community", params: { screen: "Sos" } },
  ];
}

// Offline intent match: scores the question against each action's keywords.
// Keeps the demo working when the AI provider is unreachable.
function matchActionByKeyword(question, catalogue) {
  const q = String(question || "").toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const action of catalogue) {
    const score = action.keywords.reduce((sum, kw) => (q.includes(kw) ? sum + kw.length : sum), 0);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

// A useful answer built purely from the data snapshot, for when the LLM call
// fails. Never throws — the caller relies on always getting something to say.
function deterministicReply(context, action) {
  const money = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
  try {
    if (context.role === "resident") {
      const bills = Array.isArray(context.bills) ? context.bills : [];
      const outstanding = bills
        .filter((b) => b.status !== "paid")
        .reduce((sum, b) => sum + Math.max(0, (b.amount || 0) - (b.status === "paid" ? b.amount || 0 : 0)), 0);
      if (action?.id === "pay_bill") {
        const openBills = bills.filter((b) => b.status !== "paid");
        return openBills.length
          ? `You have ${openBills.length} open bill${openBills.length === 1 ? "" : "s"} totalling about ${money(outstanding)}. Tap below to pay.`
          : "You're fully paid up — nothing outstanding right now.";
      }
      if (action?.id === "view_visitors") {
        const visitors = Array.isArray(context.visitors) ? context.visitors : [];
        const waiting = visitors.filter((v) => v.status === "pending").length;
        return waiting
          ? `${waiting} visitor${waiting === 1 ? " is" : "s are"} waiting for your approval. Tap below to review.`
          : `I have ${visitors.length} recent gate ${visitors.length === 1 ? "entry" : "entries"} for your ${context.flat || "unit"}. Tap below to open the log.`;
      }
      if (action?.id === "call_security") {
        const guard = (context.contacts || []).find((c) => c.role === "guard");
        return guard
          ? `Your guard is ${guard.name}${guard.phone ? ` on ${guard.phone}` : " (no number on file)"}. Tap below to open the directory.`
          : "Tap below to open the directory so you can reach the gate.";
      }
    }
    if (context.role === "admin" && action?.id === "finance") {
      const s = context.society || {};
      return `Collected ${money(s.collectedThisMonth)} this month, with ${money(s.pendingAllTime)} still outstanding. Tap below to open finances.`;
    }
  } catch {
    /* fall through to the generic line */
  }
  return action
    ? `Sure — I can open ${action.label.toLowerCase()} when you tap the button.`
    : "I couldn't reach the AI service just now, but you can still use the tabs below.";
}

// Answers a request AND picks the screen that fulfils it. Returns
// { reply, action, source } and never throws for a normal question: if the
// provider is down it degrades to keyword matching over the same catalogue.
export async function assistantAct(user, question) {
  const context = fitContext(await buildContext(user));
  const catalogue = actionCatalogue(user.role, context.orgType);
  const asAction = (found) =>
    found ? { id: found.id, label: found.label, route: found.route, params: found.params || null } : null;

  if (!aiEnabled) {
    const found = matchActionByKeyword(question, catalogue);
    return { reply: deterministicReply(context, found), action: asAction(found), source: "fallback" };
  }

  const v = VOCAB[context.orgType === "preschool" ? "preschool" : "society"];
  const menu = catalogue.map((a) => `- ${a.id}: ${a.intent}`).join("\n");

  try {
    const completion = await chatComplete({
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `You are GATEZO, an assistant inside a ${v.org}-management app. The user speaks or types a request; ` +
            "you reply in one or two short sentences AND choose the screen that fulfils it.\n" +
            `ACTIONS you may choose from (use the id verbatim, or null if none fits):\n${menu}\n` +
            "Rules: answer ONLY from the DATA json — never invent amounts, names or dates. " +
            "Use ₹ with Indian digit grouping. Answer the question first. If you also pick a screen, mention it as optional (do not say you are already opening it). " +
            (context.orgType === "preschool"
              ? "This is a PRESCHOOL: say students, parents, school and fees; never flat, society or maintenance. "
              : "") +
            "If the request is only a question, answer it and set actionId to null. " +
            'Return JSON: { "reply": string, "actionId": string|null }',
        },
        { role: "user", content: `DATA:\n${JSON.stringify(context)}\n\nREQUEST: ${question}` },
      ],
    });

    let parsed = {};
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    } catch {
      parsed = {};
    }
    const found = catalogue.find((a) => a.id === parsed.actionId) || null;
    const reply = String(parsed.reply || "").trim();
    if (!reply) throw new Error("AI returned an empty reply");
    return { reply, action: asAction(found), source: "ai" };
  } catch (err) {
    console.error("assistantAct failed, using keyword fallback:", err.message);
    const found = matchActionByKeyword(question, catalogue);
    return { reply: deterministicReply(context, found), action: asAction(found), source: "fallback" };
  }
}

// ---- Proactive "Society Manager": turn computed insights into polished prose ----
// The facts come from the deterministic insights engine; the LLM only writes the
// human-friendly notice / reminder / summary. Returns { title, body }.
const DRAFT_KINDS = {
  monthly_notice: "a short monthly community notice from the managing committee",
  defaulter_reminder: "a firm-but-polite payment reminder addressed to residents with outstanding dues (do NOT name individuals; speak to 'residents with pending dues')",
  money_summary: "a plain-language 'where your money went this month' summary that builds trust",
};

export async function draftManagerText(societyId, kind) {
  const type = DRAFT_KINDS[kind] ? kind : "monthly_notice";
  const insights = await computeSocietyInsights(societyId);
  const v = VOCAB[insights.orgType === "preschool" ? "preschool" : "society"];
  const orgLabel = insights.societyName || `the ${v.org}`;

  const sys =
    `You are the ${v.org} manager for GATEZO writing ${DRAFT_KINDS[type]}. ` +
    (insights.orgType === "preschool"
      ? "This is a PRESCHOOL — use 'school', 'students', 'parents/guardians' and 'fees'; NEVER 'society/flat/maintenance'. "
      : "Use 'society', 'residents', 'flats' and 'maintenance'. ") +
    "Write in clear, warm, professional Indian English. Keep it concise (a title + 4–8 short sentences or a few bullets). " +
    "Use ₹ with Indian digit grouping for money. Base EVERYTHING strictly on the DATA — never invent figures. " +
    "Return JSON: { \"title\": string, \"body\": string }. The body may use simple line breaks / '•' bullets, no markdown headers.";

  const completion = await chatComplete({
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `ORG: ${orgLabel}\nMONTH: ${insights.currentPeriod}\nDATA:\n${JSON.stringify(insights)}` },
    ],
  });
  let out = {};
  try { out = JSON.parse(completion.choices[0]?.message?.content || "{}"); } catch { /* ignore */ }
  const title = (out.title || "").trim() || (type === "money_summary" ? "This month's finances" : type === "defaulter_reminder" ? "Maintenance dues reminder" : "Monthly notice");
  const body = (out.body || "").trim();
  if (!body) throw new Error("AI returned an empty draft");
  return { title, body, kind: type };
}

// Suggests a helpful reply to a resident's community question, grounded ONLY in
// the society's own facts (amenities, timings, contacts, recent announcements).
export async function answerCommunityQuery(user, question) {
  const societyId = user.societyId || "__none__";
  const [society, amenities, contacts, announcements] = await Promise.all([
    prisma.society.findUnique({ where: { id: societyId }, select: { name: true, orgType: true } }),
    prisma.amenity.findMany({ where: { societyId, enabled: true }, include: { slots: { where: { active: true } } } }),
    prisma.user.findMany({ where: { societyId, role: { in: ["admin", "guard"] }, active: true }, select: { name: true, role: true, phone: true } }),
    prisma.announcement.findMany({ where: { societyId }, orderBy: { createdAt: "desc" }, take: 10, select: { title: true, body: true } }),
  ]);
  const v = VOCAB[society?.orgType === "preschool" ? "preschool" : "society"];
  const ctx = {
    society: society?.name,
    amenities: amenities.map((a) => ({ name: a.name, slots: a.slots.map((s) => ({ label: s.label, time: [s.startTime, s.endTime].filter(Boolean).join("-"), price: s.price })) })),
    contacts: contacts.map((c) => ({ name: c.name, role: c.role, phone: c.phone || null })),
    announcements,
  };
  const completion = await chatComplete({
    temperature: 0.3,
    messages: [
      { role: "system", content: `You are GATEZO helping answer a resident's question in the ${v.org} community feed. Answer ONLY from DATA (amenities/timings/prices, staff contacts, recent announcements). Be brief and friendly (1–3 sentences). If DATA doesn't contain the answer, say you're not sure and suggest asking the ${v.org} office. Never invent facts.` },
      { role: "user", content: `DATA:\n${JSON.stringify(ctx)}\n\nQUESTION: ${question}` },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || "I'm not sure — please check with the office.";
}

// Summarises AGM discussion + motion results into concise, neutral minutes for
// the audit trail. Returns a plain-text summary; falls back to the raw notes.
export async function summarizeMinutes(context) {
  const raw = String(context || "").trim();
  if (!raw) return "";
  if (!aiEnabled) return raw;
  try {
    const completion = await chatComplete({
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are the secretary of a housing society. Write concise, neutral AGM minutes from the provided agenda, discussion notes and motion outcomes. " +
            "Use short sections and bullet points. State each motion's result and the vote tally. Do not invent facts.",
        },
        { role: "user", content: raw },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || raw;
  } catch (err) {
    console.error("summarizeMinutes failed:", err.message);
    return raw;
  }
}

// Candidate transcription models to try, in order. We start with whatever is
// configured, then fall back to the ones the ACTIVE provider actually has. This
// makes voice entry self-heal from a common misconfig — e.g. AI_TRANSCRIBE_MODEL
// left as Groq's "whisper-large-v3" while the key/base-url point at OpenAI (which
// only has "whisper-1"), which returns a 404 "model does not exist".
function transcriptionCandidates() {
  const isGroq = /groq/i.test(BASE_URL);
  const providerDefaults = isGroq
    ? ["whisper-large-v3-turbo", "whisper-large-v3"]
    : ["whisper-1", "gpt-4o-mini-transcribe", "gpt-4o-transcribe"];
  // Configured model first, then provider defaults, de-duplicated.
  return [...new Set([TRANSCRIBE_MODEL, ...providerDefaults])];
}

// Remember the first model that worked so we don't re-try dead ones every time.
let workingTranscribeModel = null;

const isModelMissing = (err) => {
  const msg = String(err?.message || "").toLowerCase();
  return err?.status === 404 || err?.code === "model_not_found" || msg.includes("does not exist") || msg.includes("not found");
};

// Transcribes an audio buffer to text using Whisper. Whisper auto-detects the
// spoken language, so Marathi/Hindi/English (and code-mixed "Hinglish") all
// work without any extra configuration.
//
// `english` (the default) uses Whisper's *translate* task instead of *transcribe*.
// Both accept any spoken language, but translate always returns English text —
// so a guard saying "फ्लॅट ए वन ओ वन" yields "flat A101" in Latin script rather
// than Devanagari. Everything downstream (name fields, flat matching, the
// visitor record itself) is English, so this keeps one consistent script instead
// of asking the next model to transliterate. Not every provider implements the
// translations endpoint, so we fall back to plain transcription.
export async function transcribeAudio(buffer, filename = "audio.m4a", { english = true } = {}) {
  const models = workingTranscribeModel
    ? [workingTranscribeModel, ...transcriptionCandidates().filter((m) => m !== workingTranscribeModel)]
    : transcriptionCandidates();

  const call = async (model, translate) => {
    // Recreate the upload each attempt — a File/stream can only be read once.
    const file = await OpenAI.toFile(buffer, filename);
    const api = translate ? openai.audio.translations : openai.audio.transcriptions;
    const result = await api.create({ model, file });
    return result.text || "";
  };

  let lastErr = null;
  for (const model of models) {
    try {
      let text;
      if (english) {
        try {
          text = await call(model, true);
        } catch (err) {
          if (isModelMissing(err)) throw err; // let the model loop handle it
          console.warn(`transcribeAudio: translation task unavailable (${err.message}); transcribing as-is.`);
          text = await call(model, false);
        }
      } else {
        text = await call(model, false);
      }
      workingTranscribeModel = model; // cache the winner
      if (model !== TRANSCRIBE_MODEL) {
        console.warn(`transcribeAudio: configured model "${TRANSCRIBE_MODEL}" unavailable, using "${model}". Set AI_TRANSCRIBE_MODEL=${model} to silence this.`);
      }
      return text;
    } catch (err) {
      lastErr = err;
      // Only fall through for "model missing"; real errors (auth, audio) rethrow.
      if (!isModelMissing(err)) throw err;
      console.warn(`transcribeAudio: model "${model}" not available on this provider, trying next…`);
    }
  }
  throw lastErr || new Error("No transcription model available");
}

// Human language names for the codes the app offers.
const LANG_NAMES = { en: "English", hi: "Hindi (Devanagari)", mr: "Marathi (Devanagari)" };

// Translates arbitrary text to a target language (en/hi/mr) for spoken notices
// and vernacular announcements. Returns the original text unchanged if AI is off
// or the target is English-and-already-English-ish (best-effort, never throws).
export async function translateText(text, target = "hi") {
  const src = String(text || "").trim();
  if (!src) return "";
  const lang = LANG_NAMES[target] ? target : "hi";
  if (!aiEnabled) return src;
  try {
    const completion = await chatComplete({
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            `Translate the user's message into ${LANG_NAMES[lang]}. ` +
            "Keep it natural and simple enough to be read aloud to residents. " +
            "Preserve names, flat numbers, amounts and dates exactly. " +
            "Return ONLY the translation with no preamble.",
        },
        { role: "user", content: src },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || src;
  } catch (err) {
    console.error("translateText failed:", err.message);
    return src;
  }
}

// Flat numbers are written inconsistently everywhere — "A-101", "A 101", "a101"
// — and speech adds its own noise. Compare on letters and digits only.
const normFlat = (s) => String(s || "").replace(/[^a-z0-9]/gi, "").toLowerCase();

// Words that describe a unit rather than name it. Dropping them turns a spoken
// phrase like "wing A flat 101" into the "A101" that normFlat can compare.
const FLAT_FILLER = /\b(flat|unit|wing|block|number|no|apartment|apt|house|room|tower|class|section)\b/gi;

// Resolves whatever the model heard into a flat that actually exists in this
// society, so the app can select it instead of silently ignoring a near-miss.
// Returns the exact stored flatNo, or "" when there is no unambiguous match.
export function resolveFlat(spoken, knownFlats = []) {
  const raw = String(spoken || "");
  if (!raw.trim()) return "";

  // Try the phrase as heard first, then again with the filler words removed.
  for (const candidate of [raw, raw.replace(FLAT_FILLER, " ")]) {
    const want = normFlat(candidate);
    if (!want) continue;

    const exact = knownFlats.find((f) => normFlat(f) === want);
    if (exact) return exact;

    // "101" when the society stores "A-101": accept it only if exactly one flat
    // ends that way, otherwise we would be guessing between wings.
    const tail = knownFlats.filter((f) => normFlat(f).endsWith(want));
    if (tail.length === 1) return tail[0];

    // The reverse: a real flat number with extra words glued onto it.
    const inside = knownFlats.filter((f) => want.includes(normFlat(f)));
    if (inside.length === 1) return inside[0];
  }

  return "";
}

const PURPOSES = ["Guest", "Delivery", "Cab", "Service", "Other"];
// Preschools log pickups and drops as well as ordinary visitors.
const PRESCHOOL_PURPOSES = ["Pickup", "Drop", ...PURPOSES];

// Extracts structured visitor fields from a free-text (spoken) description.
// Tries the LLM first; if that fails for any reason (provider quirk, no JSON
// support, timeout), falls back to a simple regex/keyword parser so the guard
// still gets the form prefilled from a clean transcript.
//
// Guards do NOT have to say field names. Natural speech ("Ramesh Kumar to flat
// A-101, delivery from Amazon") and dictated labels ("name Ramesh Kumar, flat
// A-101, purpose delivery") both work; the prompt covers each, and the label
// words are stripped so "name" never ends up inside the visitor's name.
export async function parseVisitorFromText(text, knownFlats = [], { orgType = "society" } = {}) {
  const preschool = orgType === "preschool";
  const purposes = preschool ? PRESCHOOL_PURPOSES : PURPOSES;
  // A long society roll would blow the prompt budget; the resolver below does
  // the real matching, so the model only needs a sample to learn the format.
  const flatSample = knownFlats.slice(0, 200);

  const finish = (fields) => {
    const out = {
      name: String(fields.name || "").trim(),
      phone: String(fields.phone || "").replace(/\D/g, "").slice(0, 15),
      vehicleNo: String(fields.vehicleNo || "").replace(/\s+/g, "").toUpperCase(),
      flatNo: "",
      purpose: purposes.find((p) => p.toLowerCase() === String(fields.purpose || "").toLowerCase()) || "",
    };
    out.flatNo = resolveFlat(fields.flatNo, knownFlats);
    // Tell the caller what still needs a human: the UI highlights these rather
    // than leaving the guard to spot the empty box.
    out.missing = [
      !out.name && "name",
      !out.flatNo && (preschool ? "student" : "flat"),
    ].filter(Boolean);
    // A flat was heard but matches nothing on file — worth saying out loud.
    out.unmatchedFlat = !out.flatNo && fields.flatNo ? String(fields.flatNo).trim() : "";
    return out;
  };

  try {
    const completion = await chatComplete({
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `Extract gate-entry details from a security guard's spoken sentence at a ${preschool ? "preschool" : "housing society"} gate.\n` +
            "The guard may speak naturally (\"Ramesh Kumar to A-101, Amazon delivery, bike MH12AB1234\") " +
            "or dictate labels (\"name Ramesh Kumar, flat A one zero one, purpose delivery\"). Handle both.\n" +
            "Rules:\n" +
            "- Never include label words (name, flat, unit, phone, number, vehicle, purpose) in a value.\n" +
            "- Convert spoken digits to figures: \"A one zero one\" -> \"A-101\", \"double three\" -> \"33\".\n" +
            "- Write names in Latin script, Title Case, even if spoken in Hindi or Marathi.\n" +
            "- phone: digits only. vehicleNo: uppercase, no spaces (e.g. MH12AB1234).\n" +
            `- purpose must be exactly one of ${purposes.join(", ")} — infer it (Amazon/Swiggy/parcel -> Delivery, Uber/Ola -> Cab, plumber/electrician -> Service).\n` +
            "- Use an empty string for anything not mentioned. Never invent a value.\n" +
            `Known ${preschool ? "students" : "flats"} (match one if you can): ${JSON.stringify(flatSample)}.\n` +
            'Return JSON: { "name": string, "phone": string, "vehicleNo": string, "flatNo": string, "purpose": string }',
        },
        { role: "user", content: text },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    // Let the heuristic parser backfill anything the model left blank.
    const heuristic = fallbackParseVisitor(text, knownFlats);
    return finish({
      name: parsed.name || heuristic.name,
      phone: parsed.phone || heuristic.phone,
      vehicleNo: parsed.vehicleNo || heuristic.vehicleNo,
      flatNo: parsed.flatNo || heuristic.flatNo,
      purpose: parsed.purpose || heuristic.purpose,
    });
  } catch (err) {
    console.error("parseVisitorFromText LLM step failed, using fallback:", err.message);
    return finish(fallbackParseVisitor(text, knownFlats));
  }
}

// Dependency-free heuristic parser: pulls a flat number, phone and a likely name
// out of a short spoken sentence like "Sanket Joshi, A-1002" or "Ramesh 9876543210
// flat B-204 delivery". Best-effort only — the LLM path is preferred.
export function fallbackParseVisitor(text, knownFlats = []) {
  // Normalise Devanagari digits (०-९) to ASCII so Hindi/Marathi speech that was
  // transcribed in Devanagari still yields flat/phone numbers.
  const raw = String(text || "")
    .replace(/[\u0966-\u096F]/g, (d) => String("०१२३४५६७८९".indexOf(d)))
    .trim();
  const out = { name: "", phone: "", vehicleNo: "", flatNo: "", purpose: "" };
  if (!raw) return out;

  // Flat: match a known flat first (case/space/hyphen-insensitive), else a
  // generic "<letter>-<digits>" or "flat 1002" pattern.
  const norm = (s) => s.replace(/[\s-]/g, "").toLowerCase();
  const known = knownFlats.find((f) => norm(raw).includes(norm(f)));
  if (known) {
    out.flatNo = known;
  } else {
    const m = raw.match(/\b([A-Za-z]\s?-?\s?\d{2,4})\b/) || raw.match(/\bflat\s+([A-Za-z0-9-]+)/i);
    if (m) out.flatNo = m[1].replace(/\s+/g, "").toUpperCase();
  }

  // Phone: first 10+ digit run.
  const phone = raw.match(/\b(\d[\d\s-]{8,}\d)\b/);
  if (phone) out.phone = phone[1].replace(/[\s-]/g, "");

  // Vehicle: Indian plate-ish token (e.g. MH12AB1234).
  const veh = raw.match(/\b([A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{3,4})\b/i);
  if (veh) out.vehicleNo = veh[1].replace(/\s+/g, "").toUpperCase();

  // Purpose keyword.
  const p = raw.toLowerCase();
  for (const [key, val] of [["deliver", "Delivery"], ["डिलिव", "Delivery"], ["पार्सल", "Delivery"], ["cab", "Cab"], ["taxi", "Cab"], ["service", "Service"], ["guest", "Guest"], ["मेहमान", "Guest"], ["पाहुणे", "Guest"], ["visit", "Guest"]]) {
    if (p.includes(key)) { out.purpose = val; break; }
  }

  // Name. If the guard dictated labels ("name Ramesh Kumar, flat A-101"), take
  // what follows the name label and stop at the next label. Otherwise take the
  // leading words, up to the first comma or digit.
  const labelled = raw.match(
    /\bname\b\s*[:\-]?\s*(.+?)(?=\s*[,.]|\s+\b(?:flat|unit|wing|block|phone|mobile|number|vehicle|car|bike|purpose|student)\b|$)/i
  );
  let namePart = (labelled ? labelled[1] : raw.split(/[,\d]/)[0]).trim();
  if (out.flatNo) namePart = namePart.replace(new RegExp(out.flatNo, "i"), "").trim();
  namePart = namePart
    .replace(/\b(name|flat|unit|wing|block|phone|mobile|number|no|vehicle|purpose|delivery|cab|taxi|service|guest|visitor|pickup|drop)\b/gi, "")
    .replace(/[:\-]/g, " ")
    .trim();
  // "Ramesh Kumar to A-101" gets cut at the digit, leaving "Ramesh Kumar to A".
  // Peel off the orphaned wing letter and the connector that introduced it.
  namePart = namePart
    .replace(/\s+[A-Za-z]\s*$/, "")
    .replace(/\s+\b(to|for|at|in|from|visiting|meeting|coming)\b\s*$/i, "")
    .trim();
  if (namePart && namePart.length <= 40) out.name = namePart.replace(/\s+/g, " ");

  return out;
}
