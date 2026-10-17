import AsyncStorage from "@react-native-async-storage/async-storage";

// Device-side AES-GCM for the session token and cached personal details
// (offline bookings, visitor log, helper directory, remembered mobile).
//
// The key has to live on the device too, otherwise the app could not read the
// data back after a refresh. This stops those values sitting in the clear
// under their own storage keys. It does not hide the app's JavaScript: the
// browser has to run that code. The database key is never placed here.

const PREFIX = "gv1:";
const KEY_SLOT = "gatezo.vault.key";
let cachedKey = null;

function subtle() {
  return globalThis.crypto?.subtle || null;
}

function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function vaultKey() {
  if (cachedKey) return cachedKey;
  const cryptoSubtle = subtle();
  if (!cryptoSubtle || !globalThis.crypto?.getRandomValues) return null;
  try {
    const stored = await AsyncStorage.getItem(KEY_SLOT);
    const raw = stored ? b64ToBytes(stored) : globalThis.crypto.getRandomValues(new Uint8Array(32));
    if (!stored) await AsyncStorage.setItem(KEY_SLOT, bytesToB64(raw));
    cachedKey = await cryptoSubtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    return cachedKey;
  } catch {
    return null;
  }
}

async function sealLocal(plain) {
  const key = await vaultKey();
  if (!key) return String(plain);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(String(plain));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return PREFIX + bytesToB64(packed);
}

async function openLocal(stored) {
  const key = await vaultKey();
  if (!key) throw new Error("vault unavailable");
  const packed = b64ToBytes(stored.slice(PREFIX.length));
  const iv = packed.subarray(0, 12);
  const ct = packed.subarray(12);
  const plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

// Returns the stored string. Values written before the vault existed are
// returned as-is so a signed-in person is not logged out by the upgrade.
export async function readSecret(storageKey) {
  const raw = await AsyncStorage.getItem(storageKey);
  if (raw == null) return null;
  if (!raw.startsWith(PREFIX)) return raw;
  try {
    return await openLocal(raw);
  } catch {
    return null;
  }
}

export async function writeSecret(storageKey, value) {
  if (value == null || value === "") {
    await AsyncStorage.removeItem(storageKey);
    return;
  }
  try {
    await AsyncStorage.setItem(storageKey, await sealLocal(value));
  } catch {
    await AsyncStorage.setItem(storageKey, String(value));
  }
}
