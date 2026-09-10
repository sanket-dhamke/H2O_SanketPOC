// In-app how-to for residents, admins and guards. The Help screen and Ask
// GATEZO both read this list so answers stay consistent.
import { isPreschool } from "./org";
import { brand } from "./brand";

function brandify(text) {
  return String(text).replace(/GateMate/g, brand.name);
}

const SOCIETY_ONLY = new Set(["sustainability", "agm", "services"]);

function rewriteForPreschool(text) {
  return String(text)
    .replace(/Maintenance/g, "Fees")
    .replace(/maintenance/g, "fees")
    .replace(/clubhouse/g, "hall")
    .replace(/Clubhouse/g, "Hall")
    .replace(/neighbours/g, "parents")
    .replace(/Neighbours/g, "Parents")
    .replace(/\bsociety\b/g, "preschool")
    .replace(/\bSociety\b/g, "Preschool")
    .replace(/\bflats\b/g, "students")
    .replace(/\bFlats\b/g, "Students")
    .replace(/\bflat\b/g, "student")
    .replace(/\bFlat\b/g, "Student")
    .replace(/\bresidents\b/g, "parents")
    .replace(/\bResidents\b/g, "Parents")
    .replace(/\bguards\b/g, "staff")
    .replace(/\bGuards\b/g, "Staff")
    .replace(/At the gate, Bills & bookings, Your society, Community/g, "School and Help");
}

export function helpTopicsFor(user) {
  const preschool = isPreschool(user);
  const list = preschool ? HELP_TOPICS.filter((t) => !SOCIETY_ONLY.has(t.id)) : HELP_TOPICS;
  const branded = (t) => ({
    ...t,
    title: brandify(t.title),
    summary: brandify(t.summary),
    steps: t.steps.map(brandify),
    examples: t.examples.map(brandify),
  });
  if (!preschool) return list.map(branded);
  return list.map((t) => ({
    ...t,
    title: rewriteForPreschool(t.title),
    summary: rewriteForPreschool(t.summary),
    steps: t.steps.map(rewriteForPreschool),
    examples: t.examples.map(rewriteForPreschool),
  })).map(branded);
}

export const HELP_TOPICS = [
  {
    id: "home",
    title: "Home dashboard",
    icon: "home-outline",
    keywords: ["home", "dashboard", "summary", "pie", "chart", "trend", "outstanding"],
    summary: "Home is your snapshot: bills, visitors, SOS, folders, Home Services and offers.",
    steps: [
      "Open the Home tab. Charts show the last 30 days of visitors and your bill status.",
      "Tap a folder (At the gate, Bills & bookings, Your society, Community) to expand the shortcuts.",
      "Ask GATEZO on this page to get an answer — then tap the button if you want to open that screen.",
    ],
    examples: ["How much do I owe?", "Who visited my flat?", "What is on the Home tab?"],
  },
  {
    id: "ask",
    title: "Ask GATEZO / Assistant",
    icon: "sparkles-outline",
    keywords: ["ask", "assistant", "ai", "chat", "gatemate", "gatezo", "question"],
    summary: "Ask in plain English. You get an answer from your society data, plus a button to open the right screen.",
    steps: [
      "On Home, type in Ask GATEZO (or tap a chip).",
      "From Community, open Assistant for a full chat.",
      "Try: pay bills, visitors, book the clubhouse, raise a complaint, or how to use a feature.",
    ],
    examples: ["How much maintenance do I owe?", "How do I book the clubhouse?", "What can you help with?"],
  },
  {
    id: "visitors",
    title: "Visitors & the gate",
    icon: "people-outline",
    keywords: ["visitor", "gate", "approve", "guest", "delivery", "gate pass", "vehicle"],
    summary: "See who is at the gate, approve or deny, pre-approve guests, and register vehicles.",
    steps: [
      "Open the Visitors tab to approve, deny or leave a parcel at the gate.",
      "Create a Gate pass before guests arrive so security can let them in.",
      "Add vehicles under Vehicle passes if your society uses a gate QR.",
    ],
    examples: ["Who visited my flat?", "How do I approve a visitor?", "How do I make a gate pass?"],
  },
  {
    id: "bills",
    title: "Maintenance & bills",
    icon: "card-outline",
    keywords: ["bill", "maintenance", "pay", "due", "owe", "outstanding", "receipt", "fees", "divided", "split", "breakdown", "heads"],
    summary: "See what you owe, pay, and understand how the monthly amount is built.",
    steps: [
      "Open the Maintenance (bills) tab to see each period, due date and balance.",
      "Tap an unpaid bill to pay. Paid bills keep a receipt you can download.",
      "How the amount is divided: the committee sets maintenance heads (security, water, sinking fund, etc.) that add up to one figure per flat. A rented flat can have an override. Late fee is added only after the due date plus grace days.",
      "Ask GATEZO “how much maintenance is pending” for the live total, or “how is the bill divided” for the head split when the office billed from heads.",
    ],
    examples: ["How much maintenance is pending?", "How is the maintenance bill divided?", "Where can I get a receipt?"],
  },
  {
    id: "transparency",
    title: "Transparency score",
    icon: "shield-checkmark-outline",
    keywords: ["transparency", "ledger", "where money", "expense", "spend", "books", "audit"],
    summary: "A 0–100 score from the real books: payments in, expenses out, sealed on a tamper-evident ledger.",
    steps: [
      "Open Maintenance → Transparency (or Home → Your society).",
      "How we capture it: every bill payment and every labelled expense is written to a hash-chained ledger. If a past entry is edited or deleted, the chain breaks and the score flags it.",
      "The number is the sum of six factors: ledger intact (30), itemised expenses (20), books updated in 45 days (15), dues collected (15), payout account on file (10), recent committee updates (10).",
      "Use the page to see money in vs out and where it was spent. Admins can seal / re-verify the ledger.",
    ],
    examples: ["What is the transparency score?", "Where did maintenance money go?", "How is transparency captured?"],
  },
  {
    id: "sustainability",
    title: "Sustainability / green score",
    icon: "leaf-outline",
    keywords: ["sustainability", "green", "water", "meter", "litres", "electricity"],
    summary: "A green score from monthly water-meter readings — not from your maintenance bill.",
    steps: [
      "Open Maintenance → Sustainability (or Home → Your society).",
      "How we capture it: the office records litres used this month per flat (tap + or import a CSV). GATEZO compares each flat with the society median.",
      "Scoring: 100 at zero use, 50 at the median, lower if you use more than neighbours. The community score is the average of reported flats.",
      "Residents see their own flat, the median, and a top-savers list. This does not change what you pay in maintenance.",
    ],
    examples: ["What is the green score?", "How is sustainability captured?", "What is my water use?"],
  },
  {
    id: "community",
    title: "Community, notices & board",
    icon: "megaphone-outline",
    keywords: ["community", "announcement", "notice", "board", "post"],
    summary: "Announcements from the committee and a neighbours' board.",
    steps: [
      "Open the Community tab. Announcements are official; Board is neighbour posts.",
      "Shortcuts here open Home Services, Buy & Sell, Helpdesk, Directory, clubhouse and Assistant.",
      "Open Help (this guide) from Community or from your profile.",
    ],
    examples: ["Where are announcements?", "How do I post on the board?"],
  },
  {
    id: "services",
    title: "Home Services",
    icon: "construct-outline",
    keywords: ["home service", "cleaning", "plumber", "ac", "painter", "mover", "pest", "salon"],
    summary: "Book cleaning, AC, trades, movers and more into your flat.",
    steps: [
      "From Home, scroll to Home Services (under Community) or tap See all.",
      "Pick a service, choose a package, date and slot, then Book visit.",
      "My bookings (or Orders for admin) tracks status. Instant jobs confirm themselves.",
    ],
    examples: ["How do I book AC service?", "Where are my home-service bookings?"],
  },
  {
    id: "clubhouse",
    title: "Book the clubhouse",
    icon: "calendar-outline",
    keywords: ["clubhouse", "book", "hall", "amenity", "party", "slot"],
    summary: "Reserve the hall or amenities for a date and slot.",
    steps: [
      "Community → Book clubhouse (or Home → Bills & bookings).",
      "Pick the amenity, date and a free slot, then request. Pay if the society charges.",
    ],
    examples: ["How do I book the clubhouse?", "Book a party slot"],
  },
  {
    id: "helpdesk",
    title: "Helpdesk & SOS",
    icon: "help-buoy-outline",
    keywords: ["helpdesk", "ticket", "complaint", "repair", "sos", "emergency", "directory", "security"],
    summary: "Raise a ticket, call security from Directory, or tap Emergency SOS on Home.",
    steps: [
      "Community → Helpdesk to log a leak, lift or other issue.",
      "Directory lists office and security numbers.",
      "SOS on Home alerts guards and nearby neighbours — use it only for real emergencies.",
    ],
    examples: ["How do I raise a complaint?", "How do I call security?", "What is SOS?"],
  },
  {
    id: "agm",
    title: "AGM & voting",
    icon: "people-outline",
    keywords: ["agm", "vote", "voting", "motion", "minutes", "election"],
    summary: "Read motions, cast your vote, and see meeting minutes.",
    steps: [
      "Open Community → AGM & voting (or Home → Your society).",
      "Open a motion to read the text, then vote if voting is open.",
      "Minutes of past meetings sit on the same screen.",
    ],
    examples: ["How do I vote in the AGM?", "Where are AGM minutes?"],
  },
  {
    id: "market",
    title: "Buy & Sell and helpers",
    icon: "pricetags-outline",
    keywords: ["buy", "sell", "marketplace", "listing", "maid", "helper", "vendor"],
    summary: "List or browse items, and find rated helpers who already work in the society.",
    steps: [
      "Community → Buy & Sell to post or search listings.",
      "Trusted helpers shows rated maids and vendors.",
    ],
    examples: ["How do I sell something?", "Where are trusted helpers?"],
  },
];

export function formatHelpTopic(topic) {
  const steps = topic.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const examples = topic.examples.map((e) => `“${e}”`).join(", ");
  return `${topic.title}\n${topic.summary}\n\nHow to:\n${steps}\n\nTry asking: ${examples}`;
}

export function helpOverview(user) {
  const list = helpTopicsFor(user).map((t) => `• ${t.title} — ${t.summary}`).join("\n");
  return `Here's what ${brand.name} can do. Ask me about any of these, or open Help from Community / your profile.\n\n${list}`;
}

export function answerFromHelp(question, user) {
  const q = String(question || "")
    .toLowerCase()
    .replace(/maintain[a-z]*/g, "maintenance")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return null;
  // Live amounts / visitor lookups are answered from society data, not this guide.
  if (
    /how much|who visited|anyone named|vehicle no|number plate|please book|book .+ (for|tomorrow|today)/.test(q) &&
    !/how (do i|to) (pay|book|use|raise|see|open)/.test(q)
  ) {
    return null;
  }
  if (
    /^(help|help me|what can you do|what can (gatemate|gatezo) do|features|how to use( this| gatemate| gatezo)?|what do you (do|support))\??$/.test(
      q
    ) ||
    /what can (you|gatemate|gatezo|this app)|how (do i|to) use (gatemate|gatezo|this|the app)|list (the )?features/.test(q)
  ) {
    return helpOverview(user);
  }
  const wantsGuide =
    /how (do i|do you|to|can i|does|is|are)|what is|what's|whats|explain|guide|tutorial|where (do|can) i|how to use|how we capture|how (the )?(score|bill)/.test(
      q
    );
  if (!wantsGuide) return null;
  let best = null;
  let score = 0;
  for (const t of helpTopicsFor(user)) {
    const s = t.keywords.reduce((n, kw) => (q.includes(kw) ? n + kw.length : n), 0);
    if (s > score) {
      best = t;
      score = s;
    }
  }
  if (best && score > 0) return formatHelpTopic(best);
  return helpOverview(user);
}
