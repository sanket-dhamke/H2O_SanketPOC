import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { getToken, getBaseUrl } from "./api";

// Downloads a fresh full-platform backup to the phone and opens the share sheet
// so it can be saved to Files / Drive or attached in Gmail.
export async function savePlatformBackup() {
  const token = await getToken();
  const base = await getBaseUrl();
  const dest = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}gatemate-platform-backup.bin`;
  const result = await FileSystem.downloadAsync(`${base}/api/superadmin/backup/download`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (result.status !== 200) throw new Error("Download failed");
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: "application/octet-stream",
      dialogTitle: "Save GateMate backup",
    });
  }
  return { uri: result.uri };
}
