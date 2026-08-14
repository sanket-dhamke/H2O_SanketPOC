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
  const context = await buildContext(user);
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

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          `You are GateMate, a helpful ${v.org}-management assistant. Answer ONLY from the provided JSON data. ` +
          preschoolRule +
          residentRule +
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
          `Today is ${today}. The user's role is ${user.role}.`,
      },
      { role: "user", content: `DATA:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || "Sorry, I couldn't find an answer.";
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
    `You are the ${v.org} manager for GateMate writing ${DRAFT_KINDS[type]}. ` +
    (insights.orgType === "preschool"
      ? "This is a PRESCHOOL — use 'school', 'students', 'parents/guardians' and 'fees'; NEVER 'society/flat/maintenance'. "
      : "Use 'society', 'residents', 'flats' and 'maintenance'. ") +
    "Write in clear, warm, professional Indian English. Keep it concise (a title + 4–8 short sentences or a few bullets). " +
    "Use ₹ with Indian digit grouping for money. Base EVERYTHING strictly on the DATA — never invent figures. " +
    "Return JSON: { \"title\": string, \"body\": string }. The body may use simple line breaks / '•' bullets, no markdown headers.";

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
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
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.3,
    messages: [
      { role: "system", content: `You are GateMate helping answer a resident's question in the ${v.org} community feed. Answer ONLY from DATA (amenities/timings/prices, staff contacts, recent announcements). Be brief and friendly (1–3 sentences). If DATA doesn't contain the answer, say you're not sure and suggest asking the ${v.org} office. Never invent facts.` },
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
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
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

// Transcribes an audio buffer to text using Whisper. Whisper auto-detects the
// spoken language, so Marathi/Hindi/English (and code-mixed "Hinglish") all
// transcribe without any extra configuration.
export async function transcribeAudio(buffer, filename = "audio.m4a") {
  const file = await OpenAI.toFile(buffer, filename);
  const result = await openai.audio.transcriptions.create({
    model: TRANSCRIBE_MODEL,
    file,
  });
  return result.text || "";
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
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
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

// Extracts structured visitor fields from a free-text (spoken) description.
// Tries the LLM first; if that fails for any reason (provider quirk, no JSON
// support, timeout), falls back to a simple regex/keyword parser so the guard
// still gets the form prefilled from a clean transcript.
export async function parseVisitorFromText(text, knownFlats = []) {
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract visitor gate-entry details from the guard's spoken text. " +
            "The guard may speak in English, Hindi, Marathi or a mix (including numbers " +
            "spoken as words or in Devanagari). Understand all of these. " +
            "Return JSON with keys: name (string, in Latin/English script), phone (string, digits only), " +
            "vehicleNo (string), flatNo (string, match one of the known flats if possible), " +
            "purpose (one of Guest, Delivery, Cab, Service, Other). " +
            "Use empty string for anything not mentioned. " +
            `Known flats: ${JSON.stringify(knownFlats)}.`,
        },
        { role: "user", content: text },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    // If the model returned nothing useful, still try the heuristic parser.
    if (parsed && (parsed.name || parsed.flatNo)) return parsed;
    return { ...fallbackParseVisitor(text, knownFlats), ...parsed };
  } catch (err) {
    console.error("parseVisitorFromText LLM step failed, using fallback:", err.message);
    return fallbackParseVisitor(text, knownFlats);
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

  // Name: take the leading words before the first digit/comma/flat token.
  let namePart = raw.split(/[,\d]/)[0].trim();
  if (out.flatNo) namePart = namePart.replace(new RegExp(out.flatNo, "i"), "").trim();
  namePart = namePart.replace(/\b(flat|delivery|cab|taxi|service|guest|visitor)\b/gi, "").trim();
  if (namePart && namePart.length <= 40) out.name = namePart.replace(/\s+/g, " ");

  return out;
}
