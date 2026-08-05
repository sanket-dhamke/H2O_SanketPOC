// Customer-facing product tiers: Base < Prime < Platinum. The society's tier is
// set by the GateMate superadmin and arrives on the auth user as `societyTier`.
// Screens use `hasFeature(user, key)` to unlock/lock features by tier.

export const TIERS = ["base", "prime", "platinum"];

export const TIER_RANK = { base: 0, prime: 1, platinum: 2 };

export const TIER_LABEL = { base: "Base", prime: "Prime", platinum: "Platinum" };

// Accent colours for tier chips/badges.
export const TIER_COLOR = { base: "#2E9E52", prime: "#0B6E8F", platinum: "#7A5AF8" };

// Minimum tier required to use each feature. Anything not listed is treated as
// "base" (always available).
export const FEATURE_TIER = {
  // ---- Base (core society/preschool operations) ----
  visitors: "base",
  maintenance: "base",
  pay: "base",
  community: "base",
  helpdesk: "base",
  directory: "base",
  marketplace: "base", // Buy & Sell is an individual/consumer feature → everyone gets it
  latefee: "base",     // late-fee policy is core billing config
  heads: "base",       // maintenance heads (sinking fund, water, common…) are core billing

  // ---- Prime (automation & engagement) ----
  assistant: "prime",
  gatepass: "prime",
  amenities: "prime",
  rent: "prime",
  reminders: "prime",
  backups: "prime",
  exports: "prime",

  // ---- Platinum (hardware-integrated smart gate) ----
  smartgate: "platinum",
  vehicleqr: "platinum",
};

export function tierFor(user) {
  const t = user?.societyTier;
  return TIERS.includes(t) ? t : "platinum";
}

export function tierLabel(user) {
  return TIER_LABEL[tierFor(user)] || "Platinum";
}

// Does the user's society tier unlock this feature?
export function hasFeature(user, key) {
  const need = FEATURE_TIER[key] || "base";
  return TIER_RANK[tierFor(user)] >= TIER_RANK[need];
}

// The tier a feature needs, and its label — for "Upgrade to X" hints.
export function requiredTier(key) {
  return FEATURE_TIER[key] || "base";
}
export function requiredTierLabel(key) {
  return TIER_LABEL[requiredTier(key)] || "Prime";
}

// Feature lists per tier for display (e.g. in an upgrade / plan screen).
export const TIER_FEATURES = {
  base: [
    "Visitor log & gate entries",
    "Maintenance / fee billing + online payments",
    "Late-fee policy & maintenance heads (sinking fund, water, common, etc.)",
    "Buy & Sell marketplace",
    "Announcements",
    "Helpdesk tickets",
    "Resident / parent directory",
    "Basic reports & profile",
  ],
  prime: [
    "Everything in Base",
    "AI Assistant",
    "Gate Pass (pre-approve guests & deliveries)",
    "Amenities / hall booking",
    "WhatsApp + email reminders",
    "Rent management",
    "Automated monthly backup & wing-wise exports",
  ],
  platinum: [
    "Everything in Prime",
    "Automated vehicle gate (RFID / ANPR / QR)",
    "Flat-wise printable vehicle QR & registry",
    "Real-time entry/exit logs + notifications",
    "Priority support, custom branding & analytics",
  ],
};
