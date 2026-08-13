import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Linking,
  Share,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const humanSize = (n) => {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const READINESS = [
  { key: "offsiteStorage", label: "Off-site storage", hint: "Encrypted copy uploaded to private cloud bucket" },
  { key: "encryption", label: "Encryption (AES-256)", hint: "Set BACKUP_ENCRYPTION_KEY on the server" },
  { key: "email", label: "Email delivery", hint: "Backups + checksum emailed to the owner" },
  { key: "externalCron", label: "External scheduler", hint: "CRON_SECRET set for wake-from-sleep backups" },
];

export default function BackupRecoveryScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = useState(null);
  const [societies, setSocieties] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [emailingId, setEmailingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [st, soc] = await Promise.all([api.superBackupStatus(), api.superListSocieties()]);
      setStatus(st);
      setSocieties(soc.societies || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const runBackup = async () => {
    setRunning(true);
    try {
      const r = await api.superRunBackup();
      const lines = [
        `Records: ${r.totalRows}`,
        `Size: ${humanSize(r.sizeBytes)}`,
        `Encrypted: ${r.encrypted ? "yes" : "NO — set BACKUP_ENCRYPTION_KEY"}`,
        `Off-site: ${r.uploaded ? "uploaded" : "not configured"}`,
        `Emailed: ${r.emailed ? "yes" : r.emailDev ? "dev mode (not sent)" : "failed"}`,
        `SHA-256: ${r.sha256?.slice(0, 24)}…`,
      ].join("\n");
      Alert.alert(
        "Backup complete",
        lines,
        r.downloadUrl
          ? [
              { text: "OK" },
              { text: "Open link", onPress: () => Linking.openURL(r.downloadUrl).catch(() => {}) },
              { text: "Share link", onPress: () => Share.share({ message: r.downloadUrl }).catch(() => {}) },
            ]
          : [{ text: "OK" }]
      );
      load();
    } catch (e) {
      Alert.alert("Backup failed", e.message);
    } finally {
      setRunning(false);
    }
  };

  const openPastLink = async (id) => {
    try {
      const { url } = await api.superBackupLink(id);
      if (url) Linking.openURL(url).catch(() => {});
    } catch (e) {
      Alert.alert("Link unavailable", e.message);
    }
  };

  const emailSocietyBackup = async (s) => {
    setEmailingId(s.id);
    try {
      const r = await api.superSocietyBackupEmail(s.id);
      Alert.alert(
        "Society backup",
        r.delivered
          ? `Emailed to ${r.admins} admin(s) of ${s.name}.`
          : r.dev
          ? "Email isn't configured yet (dev mode) — nothing was actually sent."
          : r.message || "Could not send. Check the society has an admin email."
      );
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setEmailingId(null);
    }
  };

  const last = status?.last;
  const readiness = status?.readiness || {};

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="cloud-download"
        title="Backup & recovery"
        subtitle="Full-platform disaster recovery"
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Readiness */}
        <Text style={styles.sectionTitle}>Readiness</Text>
        <View style={styles.card}>
          {READINESS.map((r, i) => {
            const ok = !!readiness[r.key];
            return (
              <View key={r.key} style={[styles.readRow, i > 0 && styles.readRowBorder]}>
                <Ionicons
                  name={ok ? "checkmark-circle" : "alert-circle"}
                  size={20}
                  color={ok ? "#2E9E52" : "#C2871A"}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.readLabel}>{r.label}</Text>
                  <Text style={styles.readHint}>{r.hint}</Text>
                </View>
                <Text style={[styles.readState, { color: ok ? "#2E9E52" : "#C2871A" }]}>{ok ? "Ready" : "Set up"}</Text>
              </View>
            );
          })}
        </View>

        {/* Last backup + run */}
        <Text style={styles.sectionTitle}>Full platform backup</Text>
        <View style={styles.card}>
          {last ? (
            <>
              <View style={styles.lastRow}>
                <Ionicons name={last.ok ? "shield-checkmark" : "warning"} size={18} color={last.ok ? "#0B6E8F" : "#B44"} />
                <Text style={styles.lastWhen}>{fmt(last.at)}</Text>
              </View>
              <View style={styles.metaGrid}>
                <Meta label="Records" value={String(last.stats?.totalRows ?? "—")} />
                <Meta label="Size" value={humanSize(last.sizeBytes)} />
                <Meta label="Encrypted" value={last.encrypted ? "Yes" : "No"} />
              </View>
              {!!last.sha256 && <Text style={styles.sha}>SHA-256: {last.sha256}</Text>}
              {!!last.note && <Text style={styles.note}>{last.note}</Text>}
              {!!last.url && (
                <TouchableOpacity style={styles.linkBtn} onPress={() => openPastLink(last.id)}>
                  <Ionicons name="open-outline" size={16} color="#0B6E8F" />
                  <Text style={styles.linkBtnText}>Open off-site download link</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.empty}>No platform backup yet. Run one now.</Text>
          )}

          <TouchableOpacity style={[styles.runBtn, running && { opacity: 0.6 }]} onPress={runBackup} disabled={running}>
            {running ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                <Text style={styles.runText}>Run full backup now</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.runHint}>
            Dumps every table (encrypted), uploads an off-site copy, and emails you a checksum + link. Runs automatically every week.
          </Text>
        </View>

        {/* History */}
        {status?.history?.length > 1 && (
          <>
            <Text style={styles.sectionTitle}>Recent backups</Text>
            <View style={styles.card}>
              {status.history.map((h, i) => (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.histRow, i > 0 && styles.readRowBorder]}
                  disabled={!h.url}
                  onPress={() => h.url && openPastLink(h.id)}
                >
                  <Ionicons name={h.ok ? "document-lock-outline" : "close-circle-outline"} size={16} color={h.ok ? "#0B6E8F" : "#B44"} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histWhen}>{fmt(h.at)}</Text>
                    <Text style={styles.histMeta}>
                      {humanSize(h.sizeBytes)} · {h.stats?.totalRows ?? "—"} records{h.encrypted ? " · encrypted" : ""}
                    </Text>
                  </View>
                  {h.url ? <Ionicons name="open-outline" size={16} color="#9AA7AF" /> : null}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Per-society backups */}
        <Text style={styles.sectionTitle}>Per-society backup</Text>
        <Text style={styles.sectionHint}>Email a single society's data snapshot to its admins.</Text>
        <View style={styles.card}>
          {societies.length === 0 && <Text style={styles.empty}>No societies yet.</Text>}
          {societies.map((s, i) => (
            <View key={s.id} style={[styles.socRow, i > 0 && styles.readRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.socName}>{s.name}</Text>
                <Text style={styles.socMeta}>
                  {s.orgType === "preschool" ? "Preschool" : "Society"}
                  {s.city ? ` · ${s.city}` : ""} · {s.flats} flats
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.emailBtn, emailingId === s.id && { opacity: 0.6 }]}
                onPress={() => emailSocietyBackup(s)}
                disabled={emailingId === s.id}
              >
                {emailingId === s.id ? (
                  <ActivityIndicator size="small" color="#0B6E8F" />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={15} color="#0B6E8F" />
                    <Text style={styles.emailBtnText}>Email</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Meta({ label, value }) {
  return (
    <View style={styles.metaBox}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#5A6B75", marginTop: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionHint: { color: "#6B7B85", fontSize: 12.5, marginTop: -4, marginBottom: 8 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  readRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  readRowBorder: { borderTopWidth: 1, borderTopColor: "#EEF2F4" },
  readLabel: { color: "#1B2B33", fontWeight: "700", fontSize: 14 },
  readHint: { color: "#8895A0", fontSize: 11.5, marginTop: 1 },
  readState: { fontSize: 12, fontWeight: "800" },
  lastRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  lastWhen: { color: "#1B2B33", fontWeight: "800", fontSize: 15 },
  metaGrid: { flexDirection: "row", gap: 10, marginTop: 12 },
  metaBox: { flex: 1, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 10 },
  metaLabel: { color: "#8895A0", fontSize: 11 },
  metaValue: { color: "#1B2B33", fontWeight: "800", fontSize: 14, marginTop: 2 },
  sha: { color: "#6B7B85", fontSize: 11, marginTop: 10, fontFamily: "monospace" },
  note: { color: "#6B7B85", fontSize: 12, marginTop: 6 },
  linkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EAF4F7", borderRadius: 10, paddingVertical: 11, marginTop: 12 },
  linkBtnText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  runBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 14, marginTop: 14 },
  runText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  runHint: { color: "#8895A0", fontSize: 12, marginTop: 8, lineHeight: 17 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  histWhen: { color: "#1B2B33", fontWeight: "700", fontSize: 13 },
  histMeta: { color: "#8895A0", fontSize: 11.5, marginTop: 1 },
  socRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  socName: { color: "#1B2B33", fontWeight: "700", fontSize: 14 },
  socMeta: { color: "#8895A0", fontSize: 11.5, marginTop: 1 },
  emailBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EAF4F7", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  emailBtnText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  empty: { color: "#6B7B85", textAlign: "center", paddingVertical: 8 },
});
