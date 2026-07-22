import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_PORT = 4000;

// On web, always talk to the backend on the SAME hostname the page is served
// from (e.g. page at localhost:8090 -> API at localhost:4000). This avoids the
// browser/OS-firewall blocking calls to a LAN IP like 192.168.x.x.
function webApiUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.hostname) {
    // If a remote API is configured (hosted backend), the browser should use it
    // directly. Only fall back to same-host:4000 for pure local dev.
    const configured = Constants.expoConfig?.extra?.apiUrl;
    if (configured && !/localhost|127\.0\.0\.1/.test(configured)) {
      return configured.replace(/\/+$/, "");
    }
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }
  return null;
}

// Default backend base URL. On native this comes from app.json; on a locked-down
// network you can override it at runtime from the login screen (Advanced).
export const DEFAULT_API_URL =
  webApiUrl() || Constants.expoConfig?.extra?.apiUrl || `http://localhost:${API_PORT}`;

const TOKEN_KEY = "h2o.token";
const API_URL_KEY = "h2o.apiUrl";
const ORG_MODE_KEY = "h2o.orgMode";

// Remembers the last org type ("society" | "preschool") so a returning user
// sees the right branded login without any link or toggle.
export async function getOrgMode() {
  const v = await AsyncStorage.getItem(ORG_MODE_KEY);
  return v === "preschool" ? "preschool" : v === "society" ? "society" : null;
}
export async function setOrgMode(mode) {
  if (mode === "society" || mode === "preschool") await AsyncStorage.setItem(ORG_MODE_KEY, mode);
}

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(token) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

// Strips trailing slashes so we don't produce URLs like https://x//api/login.
function normalizeUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

export async function getBaseUrl() {
  // On web, ignore any stored override and derive from the current page host so
  // a stale LAN-IP value can never break login in the browser.
  const web = webApiUrl();
  if (web) return web;
  const stored = await AsyncStorage.getItem(API_URL_KEY);
  return normalizeUrl(stored) || DEFAULT_API_URL;
}
export async function setBaseUrl(url) {
  const clean = normalizeUrl(url);
  if (clean) await AsyncStorage.setItem(API_URL_KEY, clean);
  else await AsyncStorage.removeItem(API_URL_KEY);
}

async function request(path, { method = "GET", body } = {}) {
  const token = await getToken();
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface the backend's message so the UI shows the real reason.
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

const qs = (params) => {
  const s = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v != null && v !== "")
  ).toString();
  return s ? `?${s}` : "";
};

export const api = {
  // Public: resolve a tenant slug to its branding (name + orgType) for the login screen.
  tenantBranding: (slug) => request(`/api/tenant/${encodeURIComponent(slug)}`),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: { email, password } }),
  forgotPassword: (email) =>
    request("/api/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (email, otp, newPassword) =>
    request("/api/auth/reset-password", { method: "POST", body: { email, otp, newPassword } }),
  me: () => request("/api/me"),
  changePassword: (currentPassword, newPassword) =>
    request("/api/me/password", { method: "POST", body: { currentPassword, newPassword } }),
  updatePreferences: (prefs) =>
    request("/api/me/preferences", { method: "PATCH", body: prefs }),
  registerPushToken: (token) =>
    request("/api/push-token", { method: "POST", body: { token } }),
  flats: () => request("/api/flats"),

  maintenance: () => request("/api/maintenance"),
  payBill: (id) => request(`/api/maintenance/${id}/pay`, { method: "POST" }),
  createOrder: (id) =>
    request(`/api/maintenance/${id}/create-order`, { method: "POST" }),
  verifyPayment: (id, payload) =>
    request(`/api/maintenance/${id}/verify`, { method: "POST", body: payload }),

  visitors: () => request("/api/visitors"),
  addVisitor: (payload) =>
    request("/api/visitors", { method: "POST", body: payload }),
  decideVisitor: (id, status) =>
    request(`/api/visitors/${id}/decision`, { method: "POST", body: { status } }),
  markVisitorExit: (id) =>
    request(`/api/visitors/${id}/exit`, { method: "POST" }),

  // Staff/teacher gate attendance (preschool)
  staffAttendance: (date) => request(`/api/staff-attendance${qs({ date })}`),
  staffCheckIn: (payload) =>
    request("/api/staff-attendance", { method: "POST", body: payload }),
  staffCheckOut: (id) =>
    request(`/api/staff-attendance/${id}/checkout`, { method: "POST" }),
  // Preschool report: visitors + staff attendance history.
  adminSchoolReport: (days) => request(`/api/admin/school-report${qs({ days })}`),

  // Admin: accounts + flats
  adminListUsers: (role) => request(`/api/admin/users${qs({ role })}`),
  adminCreateUser: (payload) =>
    request("/api/admin/users", { method: "POST", body: payload }),
  adminUpdateUser: (id, payload) =>
    request(`/api/admin/users/${id}`, { method: "PATCH", body: payload }),
  adminDeleteUser: (id) =>
    request(`/api/admin/users/${id}`, { method: "DELETE" }),
  adminListFlats: () => request("/api/admin/flats"),
  adminCreateFlat: (payload) =>
    request("/api/admin/flats", { method: "POST", body: payload }),
  adminGenerateFlats: (payload) =>
    request("/api/admin/flats/generate", { method: "POST", body: payload }),
  adminImportFlats: (payload) =>
    request("/api/admin/flats/import", { method: "POST", body: payload }),

  // Admin: vendor venue marketplace (premium)
  adminVenueBookings: () => request("/api/admin/venue-bookings"),
  adminCreateVenueBooking: (payload) =>
    request("/api/admin/venue-bookings", { method: "POST", body: payload }),
  adminUpdateVenueBooking: (id, payload) =>
    request(`/api/admin/venue-bookings/${id}`, { method: "PATCH", body: payload }),
  adminDeleteVenueBooking: (id) =>
    request(`/api/admin/venue-bookings/${id}`, { method: "DELETE" }),
  adminVenuePaymentLink: (id) =>
    request(`/api/admin/venue-bookings/${id}/payment-link`, { method: "POST" }),
  adminVenueSync: (id) =>
    request(`/api/admin/venue-bookings/${id}/sync`, { method: "POST" }),

  // Admin: society bank account (Razorpay Route linked account)
  adminGetBankAccount: () => request("/api/admin/bank-account"),
  adminSaveBankAccount: (payload) =>
    request("/api/admin/bank-account", { method: "PUT", body: payload }),

  // Resident-facing masked payee info
  bankAccount: () => request("/api/bank-account"),

  // Admin: finance
  adminFinance: () => request("/api/admin/finance"),
  adminGenerateBills: (payload) =>
    request("/api/admin/bills", { method: "POST", body: payload }),
  adminRemindUnpaid: () =>
    request("/api/admin/reminders", { method: "POST" }),
  adminListExpenses: () => request("/api/admin/expenses"),
  adminAddExpense: (payload) =>
    request("/api/admin/expenses", { method: "POST", body: payload }),

  // Admin: reports & backup
  adminBlocks: () => request("/api/admin/blocks"),
  adminReport: (block) => request(`/api/admin/report${qs({ block })}`),
  adminBackup: () => request("/api/admin/backup"),
  adminEmailBackup: () => request("/api/admin/backup/email", { method: "POST" }),

  // Super admin (H2O platform owner): cross-society overview + management
  superOverview: () => request("/api/superadmin/overview"),
  superListSocieties: () => request("/api/superadmin/societies"),
  superCreateSociety: (payload) =>
    request("/api/superadmin/societies", { method: "POST", body: payload }),
  superUpdateSociety: (id, payload) =>
    request(`/api/superadmin/societies/${id}`, { method: "PATCH", body: payload }),
  superAddAdmin: (id, payload) =>
    request(`/api/superadmin/societies/${id}/admins`, { method: "POST", body: payload }),
  superSearchUsers: (query) => request(`/api/superadmin/users${qs({ query })}`),
  superResetPassword: (id, newPassword) =>
    request(`/api/superadmin/users/${id}/reset-password`, { method: "POST", body: { newPassword } }),
  superSendInvoice: (id, payload) =>
    request(`/api/superadmin/societies/${id}/invoice`, { method: "POST", body: payload || {} }),
  superTestEmail: (to) =>
    request("/api/superadmin/test-email", { method: "POST", body: { to } }),

  // Admin: record a cash payment against a bill
  adminMarkCash: (id, payload) =>
    request(`/api/admin/bills/${id}/cash`, { method: "POST", body: payload }),

  // Community: announcements (admin -> all) + posts board (residents)
  announcements: () => request("/api/announcements"),
  createAnnouncement: (payload) =>
    request("/api/announcements", { method: "POST", body: payload }),
  deleteAnnouncement: (id) =>
    request(`/api/announcements/${id}`, { method: "DELETE" }),
  posts: () => request("/api/posts"),
  createPost: (payload) => request("/api/posts", { method: "POST", body: payload }),
  deletePost: (id) => request(`/api/posts/${id}`, { method: "DELETE" }),

  // Amenities & bookings (clubhouse booking engine)
  amenities: () => request("/api/amenities"),
  bookings: () => request("/api/bookings"),
  amenityAvailability: (id) => request(`/api/amenities/${id}/availability`),
  createBooking: (payload) =>
    request("/api/bookings", { method: "POST", body: payload }),
  cancelBooking: (id) => request(`/api/bookings/${id}/cancel`, { method: "POST" }),
  payBooking: (id) => request(`/api/bookings/${id}/pay`, { method: "POST" }),
  // Admin amenity management
  adminListAmenities: () => request("/api/admin/amenities"),
  adminCreateAmenity: (payload) =>
    request("/api/admin/amenities", { method: "POST", body: payload }),
  adminUpdateAmenity: (id, payload) =>
    request(`/api/admin/amenities/${id}`, { method: "PATCH", body: payload }),
  adminDeleteAmenity: (id) =>
    request(`/api/admin/amenities/${id}`, { method: "DELETE" }),
  adminAddSlot: (id, payload) =>
    request(`/api/admin/amenities/${id}/slots`, { method: "POST", body: payload }),
  adminUpdateSlot: (id, payload) =>
    request(`/api/admin/slots/${id}`, { method: "PATCH", body: payload }),
  adminDeleteSlot: (id) => request(`/api/admin/slots/${id}`, { method: "DELETE" }),
  adminDecideBooking: (id, status) =>
    request(`/api/admin/bookings/${id}/decision`, { method: "POST", body: { status } }),

  // AI (phase 5)
  aiAssistant: (question) =>
    request("/api/ai/assistant", { method: "POST", body: { question } }),
  aiVoiceVisitor: (payload) =>
    request("/api/ai/voice-visitor", { method: "POST", body: payload }),
};
