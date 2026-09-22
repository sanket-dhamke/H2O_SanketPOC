import { getToken, getBaseUrl } from "./api";

// Downloads a fresh full-platform backup and triggers the browser Save dialog.
export async function savePlatformBackup() {
  const token = await getToken();
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/superadmin/backup/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^"]+)"?/.exec(cd);
  const filename = match?.[1] || "gatemate-platform-backup.json.gz";
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
  return { filename };
}
