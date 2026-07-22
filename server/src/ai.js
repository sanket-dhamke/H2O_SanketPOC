import OpenAI from "openai";
import { prisma } from "./prisma.js";

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
      currentPeriod,
      society: { name: dbUser?.society?.name || null },
      contacts,
      flat: dbUser?.flat?.flatNo,
      visitors: visitors.map((v) => ({
        name: v.name, purpose: v.purpose, vehicleNo: v.vehicleNo, phone: v.phone,
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

// Answers a natural-language question over the role-scoped data snapshot.
export async function assistantAnswer(user, question) {
  const context = await buildContext(user);
  const today = new Date().toISOString();
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are H2O, a helpful society-management assistant. Answer ONLY from the provided JSON data. " +
          "Be concise and specific (dates, names, amounts in INR, formatted like ₹1,200). If the data does not contain the answer, say so. " +
          "Money fields: society.collectedThisMonth = maintenance collected in the current month (data.currentPeriod, format YYYY-MM); " +
          "society.collectedAllTime = collected across all time; society.pendingAllTime = outstanding dues; " +
          "society.balance = collected minus expenses. collectionByMonth breaks down billed/collected/pending per month. " +
          "When the user says 'this month' use data.currentPeriod; for a named month, match it in collectionByMonth. " +
          "'contacts' lists the society's admins (office/chairman) and guards with their phone numbers — use it to answer " +
          "'who is my guard/admin/chairman' and give their name and phone (say the number isn't on file if phone is null). " +
          "For paying maintenance: a resident can only pay bills that appear in 'bills' with status 'pending', from the 'Maintenance' tab. " +
          "Paying next month or a full year in advance is NOT supported yet — if asked, explain that only bills already issued can be paid, " +
          "list their pending bills (period, amount, due date), and suggest contacting the admin to raise advance bills. " +
          "The data may include 'amenities' (bookable facilities like a clubhouse, with slots and prices) and bookings. " +
          "If the user asks to book a clubhouse/amenity, you cannot book it yourself — tell them the available amenities, " +
          "slots and prices from the data, and direct them to open the 'Amenities' tab to request a slot (admin approves, then they pay in-app). " +
          `Today is ${today}. The user's role is ${user.role}.`,
      },
      { role: "user", content: `DATA:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || "Sorry, I couldn't find an answer.";
}

// Transcribes an audio buffer to text using Whisper.
export async function transcribeAudio(buffer, filename = "audio.m4a") {
  const file = await OpenAI.toFile(buffer, filename);
  const result = await openai.audio.transcriptions.create({
    model: TRANSCRIBE_MODEL,
    file,
  });
  return result.text || "";
}

// Extracts structured visitor fields from a free-text (spoken) description.
export async function parseVisitorFromText(text, knownFlats = []) {
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extract visitor gate-entry details from the guard's spoken text. " +
          "Return JSON with keys: name (string), phone (string), vehicleNo (string), " +
          "flatNo (string, match one of the known flats if possible), purpose (one of Guest, Delivery, Cab, Service, Other). " +
          "Use empty string for anything not mentioned. " +
          `Known flats: ${JSON.stringify(knownFlats)}.`,
      },
      { role: "user", content: text },
    ],
  });
  try {
    return JSON.parse(completion.choices[0]?.message?.content || "{}");
  } catch {
    return {};
  }
}
