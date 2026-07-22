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
    include: { flat: true },
  });

  if (user.role === "resident") {
    const flatId = dbUser?.flatId;
    const [visitors, bills] = await Promise.all([
      prisma.visitor.findMany({ where: { flatId }, orderBy: { createdAt: "desc" }, take: 40 }),
      prisma.bill.findMany({ where: { flatId }, orderBy: { period: "desc" } }),
    ]);
    return {
      role: "resident",
      flat: dbUser?.flat?.flatNo,
      visitors: visitors.map((v) => ({
        name: v.name, purpose: v.purpose, vehicleNo: v.vehicleNo, phone: v.phone,
        status: v.status, at: v.createdAt,
      })),
      bills: bills.map((b) => ({ period: b.period, amount: b.amount, status: b.status, dueDate: b.dueDate })),
    };
  }

  // guard / admin: society-wide (bounded) snapshot, scoped to their society.
  const societyId = dbUser?.societyId || user.societyId || "__none__";
  const [visitors, bills, expenses, flats] = await Promise.all([
    prisma.visitor.findMany({ where: { flat: { societyId } }, include: { flat: true }, orderBy: { createdAt: "desc" }, take: 80 }),
    prisma.bill.findMany({ where: { flat: { societyId } }, include: { flat: true } }),
    prisma.expense.findMany({ where: { societyId } }),
    prisma.flat.findMany({ where: { societyId } }),
  ]);
  const collected = bills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);
  const pending = bills.filter((b) => b.status === "pending").reduce((s, b) => s + b.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  return {
    role: user.role,
    society: {
      flats: flats.length,
      collected, pending, totalExpenses, balance: collected - totalExpenses,
    },
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
          "Be concise and specific (dates, names, amounts in INR). If the data does not contain the answer, say so. " +
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
