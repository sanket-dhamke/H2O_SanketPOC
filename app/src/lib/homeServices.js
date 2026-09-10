import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { withLocalThumbs } from "./serviceImages";
import { brand } from "./brand";

// Mirrors server/src/homeServicesCatalog.js so the catalogue renders even when
// the live API has not been redeployed yet.

export const HOME_SERVICE_SLOTS = [
  "09:00–11:00",
  "11:00–13:00",
  "14:00–16:00",
  "16:00–18:00",
  "18:00–20:00",
];

export const HOME_SERVICES = [
  {
    slug: "instant",
    name: "Instant Services",
    tagline: "Electrician, plumber or locksmith at your door",
    badge: "15 mins",
    category: "urgent",
    color: "#0B6E8F",
    icon: "flash",
    image: require("../../assets/services/instant.jpg"),
    etaMinutes: 15,
    priceFrom: 299,
    partnerName: `${brand.name} Instant Crew`,
    rating: 4.8,
    jobs: "12k+",
    packages: [
      { id: "elec", name: "Electrician visit", price: 299, duration: "30–45 min", detail: "Switch, fan, MCB, inverter — parts extra" },
      { id: "plumb", name: "Plumber visit", price: 299, duration: "30–45 min", detail: "Tap, flush, leak, blockage" },
      { id: "lock", name: "Locksmith visit", price: 399, duration: "20–40 min", detail: "Lockout, latch, duplicate key" },
    ],
  },
  {
    slug: "cleaning",
    name: "Home Cleaning",
    tagline: "Deep clean, sofa shampoo & bathroom shine",
    category: "home",
    color: "#0B6E8F",
    icon: "sparkles",
    image: require("../../assets/services/cleaning.jpg"),
    etaMinutes: 180,
    priceFrom: 799,
    partnerName: "Sparkle Homes",
    rating: 4.7,
    jobs: "8k+",
    packages: [
      { id: "1bhk", name: "1 BHK deep clean", price: 799, duration: "2–3 hrs", detail: "Kitchen, bath, floor, dusting" },
      { id: "2bhk", name: "2 BHK deep clean", price: 1299, duration: "3–4 hrs", detail: "Full flat + balcony" },
      { id: "3bhk", name: "3 BHK deep clean", price: 1799, duration: "4–5 hrs", detail: "Full flat + kitchen degrease" },
      { id: "sofa", name: "Sofa shampoo", price: 499, duration: "1 hr", detail: "3-seater, eco foam" },
    ],
  },
  {
    slug: "movers",
    name: "Packers & Movers",
    tagline: "Free instant quote · society-aware crew",
    category: "move",
    color: "#0B6E8F",
    icon: "cube",
    image: require("../../assets/services/movers.jpg"),
    etaMinutes: 1440,
    priceFrom: 2499,
    partnerName: "PorterGo Society",
    rating: 4.6,
    jobs: "3k+",
    packages: [
      { id: "studio", name: "Studio / 1 BHK local", price: 2499, duration: "Same day", detail: "Within 15 km · 1 helper + tempo" },
      { id: "2bhk", name: "2 BHK local", price: 4999, duration: "1 day", detail: "Packing + unloading at tower" },
      { id: "intercity", name: "Intercity survey", price: 999, duration: "Visit", detail: "Survey + locked quote in 24 hrs" },
    ],
  },
  {
    slug: "ac",
    name: "AC Service & Appliances",
    tagline: "AC, fridge, washer, TV, fan, lights & more",
    category: "home",
    color: "#0B6E8F",
    icon: "snow",
    image: require("../../assets/services/ac.jpg"),
    etaMinutes: 120,
    priceFrom: 199,
    partnerName: "CoolAir Partners",
    rating: 4.9,
    jobs: "20k+",
    packages: [
      { id: "svc", group: "Air conditioners", name: "AC wet service", price: 499, duration: "45–60 min", detail: "Filter, coil, drain" },
      { id: "gas", group: "Air conditioners", name: "Gas top-up", price: 1499, duration: "60–90 min", detail: "Leak check + refrigerant" },
      { id: "install", group: "Air conditioners", name: "AC install / uninstall", price: 2499, duration: "2–3 hrs", detail: "Copper extra as per run" },
      { id: "fridge", group: "Home appliances", name: "Fridge repair", price: 399, duration: "45–75 min", detail: "Cooling, frost, thermostat — parts extra" },
      { id: "washer", group: "Home appliances", name: "Washing machine repair", price: 399, duration: "45–75 min", detail: "Drain, spin, noise — parts extra" },
      { id: "fan", group: "Home appliances", name: "Fan repair / install", price: 249, duration: "30–45 min", detail: "Ceiling, table or exhaust fan" },
      { id: "tv", group: "Home appliances", name: "LED TV repair", price: 499, duration: "45–90 min", detail: "No display, sound, ports — parts extra" },
      { id: "lights", group: "Home appliances", name: "Lights & fittings", price: 199, duration: "30–45 min", detail: "Bulb, tube, false-ceiling light" },
      { id: "microwave", group: "Home appliances", name: "Microwave / chimney", price: 399, duration: "45 min", detail: "Not heating, spark, suction" },
      { id: "geyser", group: "Home appliances", name: "Geyser / water heater", price: 349, duration: "40–60 min", detail: "No heat, leak, thermostat — parts extra" },
      { id: "ro", group: "Home appliances", name: "RO / water purifier", price: 349, duration: "40–60 min", detail: "Filter change, leak, low output" },
      { id: "mixer", group: "Home appliances", name: "Mixer / grinder", price: 249, duration: "30–45 min", detail: "Jar, spark, motor — parts extra" },
      { id: "inverter", group: "Home appliances", name: "Inverter / stabilizer", price: 399, duration: "45–60 min", detail: "No backup, beeping, wiring" },
    ],
  },
  {
    slug: "trades",
    name: "Plumbing, Electrician & Carpentry",
    tagline: "Same-day visits inside the society",
    category: "home",
    color: "#C2571A",
    icon: "hammer",
    image: require("../../assets/services/trades.jpg"),
    etaMinutes: 240,
    priceFrom: 349,
    partnerName: "Tower Trades Co.",
    rating: 4.7,
    jobs: "15k+",
    packages: [
      { id: "plumb", name: "Plumbing job", price: 349, duration: "45–90 min", detail: "Tap, flush, mixer, leak" },
      { id: "elec", name: "Electrical job", price: 349, duration: "45–90 min", detail: "Switchboard, light, fan" },
      { id: "carp", name: "Carpentry job", price: 449, duration: "1–2 hrs", detail: "Door, hinge, shelf, drill" },
    ],
  },
  {
    slug: "painting",
    name: "Home Painting",
    tagline: "Interior in 3 days · colour consult included",
    category: "home",
    color: "#1E7A3D",
    icon: "color-palette",
    image: require("../../assets/services/painting.jpg"),
    etaMinutes: 4320,
    priceFrom: 4999,
    partnerName: "WallMint",
    rating: 4.8,
    jobs: "4k+",
    packages: [
      { id: "room", name: "1 room (walls + ceiling)", price: 4999, duration: "1 day", detail: "Tractor emulsion, 2 coats" },
      { id: "2bhk", name: "2 BHK interior", price: 18999, duration: "3 days", detail: "Putty touch-up + 2 coats" },
      { id: "consult", name: "Colour consult visit", price: 299, duration: "45 min", detail: "Adjusted if you book a pack" },
    ],
  },
  {
    slug: "legal",
    name: "Rent Agreement & Legal",
    tagline: "Notarised agreement, police verify, token",
    category: "legal",
    color: "#1B2B33",
    icon: "document-text",
    image: require("../../assets/services/legal.jpg"),
    etaMinutes: 2880,
    priceFrom: 999,
    partnerName: "LexNest",
    rating: 4.9,
    jobs: "6k+",
    related: { label: "Open society rent agreements", route: "Maintenance", params: { screen: "RentAgreements" } },
    packages: [
      { id: "draft", name: "11-month rent agreement", price: 999, duration: "48 hrs", detail: "E-sign + 2 copies" },
      { id: "notary", name: "Notarised + biometrics", price: 1999, duration: "3 days", detail: "Home visit in society" },
      { id: "notice", name: "Legal notice / review", price: 1499, duration: "24 hrs", detail: "Advocate call included" },
    ],
  },
  {
    slug: "interiors",
    name: "Home Interiors",
    tagline: "10k+ homes · free design ideas",
    category: "home",
    color: "#0B6E8F",
    icon: "bed",
    image: require("../../assets/services/interiors.jpg"),
    etaMinutes: 10080,
    priceFrom: 0,
    partnerName: "Nest Studio",
    rating: 4.8,
    jobs: "10k+",
    packages: [
      { id: "ideas", name: "Free design ideas call", price: 0, duration: "30 min", detail: "Video consult for your flat" },
      { id: "kitchen", name: "Modular kitchen survey", price: 999, duration: "Visit", detail: "Adjusted against order" },
      { id: "full", name: "Full-home design kickoff", price: 4999, duration: "On-site", detail: "3D moodboard in 7 days" },
    ],
  },
  {
    slug: "salon",
    name: "Home Salon",
    tagline: "Women & kids · at your flat in 45 min",
    category: "lifestyle",
    color: "#C2571A",
    icon: "cut",
    image: require("../../assets/services/salon.jpg"),
    etaMinutes: 45,
    priceFrom: 399,
    partnerName: "Glow Studio",
    rating: 4.8,
    jobs: "9k+",
    packages: [
      { id: "blow", name: "Blow dry + style", price: 399, duration: "45 min", detail: "At your door" },
      { id: "facial", name: "Cleanup + facial", price: 799, duration: "60 min", detail: "Sensitive-skin kit" },
      { id: "bridal", name: "Party makeup", price: 2499, duration: "90 min", detail: "Trial optional" },
    ],
  },
  {
    slug: "pest",
    name: "Pest Control",
    tagline: "Cockroach, bedbug & termite — family-safe",
    category: "home",
    color: "#1E7A3D",
    icon: "bug",
    image: require("../../assets/services/pest.jpg"),
    etaMinutes: 90,
    priceFrom: 699,
    partnerName: "SafeNest Pest",
    rating: 4.6,
    jobs: "5k+",
    packages: [
      { id: "general", name: "General pest (1 BHK)", price: 699, duration: "45 min", detail: "Gel + spray, pet-safe wait 2 hrs" },
      { id: "bedbug", name: "Bedbug treatment", price: 1499, duration: "90 min", detail: "Mattress + sofa" },
      { id: "termite", name: "Termite inspection", price: 499, duration: "40 min", detail: "Quote after drill survey" },
    ],
  },
  {
    slug: "laundry",
    name: "Laundry Pickup",
    tagline: "Leave at gate · folded back in 24 hrs",
    category: "lifestyle",
    color: "#0B6E8F",
    icon: "shirt",
    image: require("../../assets/services/laundry.jpg"),
    etaMinutes: 1440,
    priceFrom: 149,
    partnerName: "Washly Gate",
    rating: 4.7,
    jobs: "11k+",
    packages: [
      { id: "wash", name: "Wash & fold (up to 5 kg)", price: 149, duration: "24 hrs", detail: "Pickup from gate" },
      { id: "iron", name: "Iron only (10 pcs)", price: 199, duration: "Same day", detail: "Hanger return" },
      { id: "dry", name: "Dry clean (3 pcs)", price: 399, duration: "48 hrs", detail: "Suits, silk, wool" },
    ],
  },
];

export const FEATURED_SLUGS = ["instant", "cleaning", "movers", "ac", "trades", "painting", "legal", "interiors"];

export function findHomeService(slug) {
  const s = HOME_SERVICES.find((row) => row.slug === slug) || null;
  if (!s) return null;
  const [withThumb] = withLocalThumbs([s]);
  return withThumb;
}

export const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

const storeKey = (userId) => `h2o.hsBookings.${userId || "anon"}`;

async function readLocal(userId) {
  try {
    const raw = await AsyncStorage.getItem(storeKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeLocal(userId, rows) {
  await AsyncStorage.setItem(storeKey(userId), JSON.stringify(rows.slice(0, 200)));
}

function isOfflineErr(e) {
  const msg = String(e?.message || "");
  return /404|503|not available|not found|failed \(4|failed \(5|Network/i.test(msg);
}

export async function loadHomeServices() {
  try {
    const data = await api.homeServices();
    if (data?.services?.length) {
      return { services: withLocalThumbs(data.services), slots: data.slots || HOME_SERVICE_SLOTS };
    }
  } catch {
    /* local catalogue */
  }
  return { services: HOME_SERVICES, slots: HOME_SERVICE_SLOTS };
}

export async function loadServiceBookings(user) {
  try {
    const data = await api.homeServiceBookings();
    return { bookings: data.bookings || [], offline: false };
  } catch (e) {
    if (!isOfflineErr(e)) throw e;
    return { bookings: await readLocal(user?.id), offline: true };
  }
}

export async function createServiceBooking(user, payload) {
  try {
    const data = await api.createHomeServiceBooking(payload);
    return { booking: data.booking, offline: false };
  } catch (e) {
    if (!isOfflineErr(e)) throw e;
    const service = findHomeService(payload.serviceSlug);
    const pack = service?.packages?.find((p) => p.id === payload.packageId);
    const instant = (service?.etaMinutes || 999) <= 15;
    const booking = {
      id: `local-${Date.now()}`,
      serviceSlug: payload.serviceSlug,
      serviceName: service?.name || payload.serviceSlug,
      packageId: payload.packageId,
      packageName: pack?.name || payload.packageId,
      amount: pack?.price || 0,
      scheduledDate: payload.scheduledDate,
      slot: payload.slot,
      notes: payload.notes || "",
      partnerName: service?.partnerName || null,
      status: instant ? "confirmed" : "requested",
      residentName: user?.name,
      flatNo: user?.flatNo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const rows = await readLocal(user?.id);
    await writeLocal(user?.id, [booking, ...rows]);
    return { booking, offline: true };
  }
}

export async function updateServiceBooking(user, id, status) {
  try {
    const data = await api.updateHomeServiceBooking(id, { status });
    return { booking: data.booking, offline: false };
  } catch (e) {
    if (!isOfflineErr(e)) throw e;
    const rows = await readLocal(user?.id);
    const next = rows.map((r) => (r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r));
    await writeLocal(user?.id, next);
    return { booking: next.find((r) => r.id === id), offline: true };
  }
}

export const BOOKING_STATUS = {
  requested: { label: "Requested", color: "#C2571A", bg: "#FBEADD" },
  confirmed: { label: "Confirmed", color: "#0B6E8F", bg: "#EAF4F7" },
  assigned: { label: "Partner assigned", color: "#0B6E8F", bg: "#EAF4F7" },
  completed: { label: "Completed", color: "#1E7A3D", bg: "#E6F5EC" },
  cancelled: { label: "Cancelled", color: "#8794A0", bg: "#EEF2F4" },
};
