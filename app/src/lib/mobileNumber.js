import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const keyFor = (userId) => `gatezo.mobile.${userId}`;

// 10-digit Indian mobile, or "" when the value is empty or not a mobile.
export function normalizeIndianMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const last10 = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(last10)) return "";
  return last10;
}

export function displayMobile(value) {
  const n = normalizeIndianMobile(value);
  if (!n) return "";
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
}

async function remember(userId, phone) {
  if (!userId) return;
  if (phone) await AsyncStorage.setItem(keyFor(userId), phone);
  else await AsyncStorage.removeItem(keyFor(userId));
}

// The live API still ignores a phone on preferences. Keep the number on this
// device so checkout can use it, and drop that copy once the account has one.
export async function applyRememberedMobile(user) {
  if (!user?.id || normalizeIndianMobile(user.phone)) return user;
  try {
    const saved = normalizeIndianMobile(await AsyncStorage.getItem(keyFor(user.id)));
    if (!saved) return user;
    return { ...user, phone: saved };
  } catch {
    return user;
  }
}

export async function saveMobileNumber(userId, raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    await api.updatePreferences({ phone: "" });
    await remember(userId, null);
    return null;
  }
  const phone = normalizeIndianMobile(trimmed);
  if (!phone) {
    throw new Error("Enter a 10-digit Indian mobile number.");
  }
  const res = await api.updatePreferences({ phone });
  const echoed = normalizeIndianMobile(res?.user?.phone);
  if (echoed === phone) {
    await remember(userId, null);
    return phone;
  }
  await remember(userId, phone);
  return phone;
}
