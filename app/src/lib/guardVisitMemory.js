import AsyncStorage from "@react-native-async-storage/async-storage";

const keyFor = (userId) => `gatezo.guardClose.${userId}`;

export async function loadGuardCloses(userId) {
  if (!userId) return {};
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function rememberGuardClose(userId, visitorId, entry) {
  if (!userId || !visitorId) return loadGuardCloses(userId);
  const all = await loadGuardCloses(userId);
  all[visitorId] = {
    status: entry.status,
    decisionNote: entry.decisionNote || "",
  };
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(all));
  return all;
}
