import React, { useCallback, useMemo, useState } from "react";
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
  Modal,
  Platform,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";
import KeyboardAvoider from "../../components/KeyboardAvoider";
import TextInput from "../../components/AppTextInput";
import { savePlatformBackup } from "../../lib/backupFile";
import { OWNER_EMAIL, openEmailCompose, parseRecipients, uniqueEmails } from "../../lib/openMail";

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const humanSize = (n) => {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};
const shortFp = (sha) => (sha ? `${String(sha).slice(0, 8)}…` : "—");

const READINESS = [
  {
    key: "offsiteStorage",
    icon: "cloud-outline",
    label: "Cloud copy",
    hintReady: "A copy is uploaded to a private cloud folder",
    hintTodo: "Not connected — tap to see where backups go",
    title: "Where is the backup stored?",
    body:
      "A full platform backup is a snapshot of everything in GateMate — every society, flat, user, bill, visitor and setting.\n\n" +
      "Right now a cloud folder is not connected, so the backup FILE is not kept off-site. What this screen shows is a record of the run (date, size, fingerprint).\n\n" +
      "To keep a real copy:\n" +
      "• Save it to this phone (Save a copy)\n" +
      "• Email it to yourself via Gmail\n\n" +
      "Connecting automatic cloud storage is a one-time server setup. It cannot be switched on from this screen.",
  },
  {
    key: "encryption",
    icon: "lock-closed-outline",
    label: "File lock",
    hintReady: "Backup files are locked with a secret key",
    hintTodo: "Off — the file is not password-locked",
    title: "File lock (encryption)",
    body:
      "A file lock scrambles the backup so that if someone else gets the file, they cannot open it without a secret key.\n\n" +
      "This is currently off, so today's backup is compressed but not locked.\n\n" +
      "Turning it on is a one-time server setting. You can still save and email backups without it.",
  },
  {
    key: "email",
    icon: "mail-outline",
    label: "Email a copy",
    hintReady: "Server can send backup emails automatically",
    hintTodo: "Opens Gmail so you can send the copy yourself",
    title: "Email a backup copy",
    body:
      "GateMate does not send mail from the server yet, so nothing goes out silently in the background.\n\n" +
      "Tap Open Gmail below. It opens Gmail (or your default mail app) with the message filled in. Use your usual account (sanket.dhamke@gmail.com). You can add or change recipient emails in the To field before you send.",
    compose: true,
  },
  {
    key: "externalCron",
    icon: "time-outline",
    label: "Auto weekly backup",
    hintReady: "A weekly wake-up is configured on the server",
    hintTodo: "Not scheduled — tap Run backup whenever you need one",
    title: "Automatic weekly backup",
    body:
      "On this hosting plan the server sleeps when nobody is using it, so a weekly backup may not run by itself.\n\n" +
      "You can tap “Run full backup now” any time. An automatic weekly alarm is a developer setting on the server — this screen cannot switch it on.",
  },
];

function backupEmailBody({ last, result, extra }) {
  const rec = result || last;
  const lines = [
    "GateMate full platform backup",
    rec?.at || rec?.generatedAt ? `When: ${fmt(rec.at || rec.generatedAt)}` : `When: ${new Date().toLocaleString()}`,
    rec?.totalRows != null || rec?.stats?.totalRows != null
      ? `Records: ${result?.totalRows ?? last?.stats?.totalRows ?? "—"}`
      : null,
    rec?.sizeBytes != null ? `Size: ${humanSize(rec.sizeBytes)}` : null,
    rec?.encrypted != null ? `File lock: ${rec.encrypted ? "Yes" : "No"}` : null,
    rec?.sha256 ? `Fingerprint (SHA-256): ${rec.sha256}` : last?.sha256 ? `Fingerprint (SHA-256): ${last.sha256}` : null,
    "",
    "This is a full copy of every society, user, bill and visitor on GateMate. Keep this email with the backup file.",
    "If you saved the file on your phone, attach it here before sending.",
    extra || "",
  ].filter((x) => x != null);
  return lines.join("\n");
}

export default function BackupRecoveryScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = useState(null);
  const [societies, setSocieties] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailingId, setEmailingId] = useState(null);
  const [infoItem, setInfoItem] = useState(null);
  const [compose, setCompose] = useState(null); // { title, subject, body, recipients }

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

  const last = status?.last;
  const readiness = status?.readiness || {};
  const defaultTo = useMemo(
    () => uniqueEmails(status?.contactEmail, OWNER_EMAIL).join(", "),
    [status?.contactEmail]
  );

  const openCompose = (partial) => {
    setInfoItem(null);
    setCompose({
      title: partial.title || "Email backup",
      subject: partial.subject || "GateMate platform backup",
      body: partial.body || "",
      recipients: partial.recipients || defaultTo,
    });
  };

  const sendCompose = async () => {
    const to = parseRecipients(compose?.recipients);
    if (!to.length) {
      Alert.alert("Add a recipient", "Type at least one email in To, then tap Open Gmail.");
      return;
    }
    try {
      await openEmailCompose({ to, subject: compose.subject, body: compose.body });
      setCompose(null);
    } catch (e) {
      Alert.alert("Could not open email", e.message);
    }
  };

  const runBackup = async () => {
    setRunning(true);
    try {
      const r = await api.superRunBackup();
      load();
      openCompose({
        title: "Email this backup",
        subject: r.emailSubject || `GateMate platform backup — ${new Date().toISOString().slice(0, 10)}`,
        body: r.emailBody || backupEmailBody({ result: r }),
        recipients: uniqueEmails(r.recipients, defaultTo).join(", ") || defaultTo,
      });
    } catch (e) {
      Alert.alert("Backup failed", e.message);
    } finally {
      setRunning(false);
    }
  };

  const saveCopy = async () => {
    setSaving(true);
    try {
      await savePlatformBackup();
    } catch (e) {
      Alert.alert("Could not save backup", e.message);
    } finally {
      setSaving(false);
    }
  };

  const copyFingerprint = async (sha) => {
    if (!sha) return;
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(sha);
        Alert.alert("Copied", "Fingerprint copied. Keep it with the backup file.");
      } else {
        await Share.share({ message: sha, title: "Backup fingerprint" });
      }
    } catch {
      Alert.alert("Fingerprint", sha);
    }
  };

  const openPastLink = async (id) => {
    try {
      const { url } = await api.superBackupLink(id);
      if (url) Linking.openURL(url).catch(() => {});
    } catch (e) {
      Alert.alert("File not in the cloud", e.message);
    }
  };

  const emailSocietyBackup = async (s) => {
    setEmailingId(s.id);
    try {
      const r = await api.superSocietyBackupEmail(s.id);
      openCompose({
        title: `Email ${s.name} backup`,
        subject: r.subject || `GateMate backup — ${s.name}`,
        body:
          (r.summaryText || `GateMate backup for ${s.name}.`) +
          "\n\nIf the file is on your phone, attach it before sending.",
        recipients: uniqueEmails(r.recipients, defaultTo).join(", ") || defaultTo,
      });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setEmailingId(null);
    }
  };

  const storedIn = last?.url
    ? "Private cloud folder (off-site)"
    : "Not saved to the cloud — save or email a copy to keep it";

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
        <Text style={styles.sectionTitle}>Setup</Text>
        <Text style={styles.sectionHint}>Tap a row to see what it means and what you can do.</Text>
        <View style={styles.card}>
          {READINESS.map((r, i) => {
            const ok = !!readiness[r.key];
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.readRow, i > 0 && styles.readRowBorder]}
                onPress={() => setInfoItem(r)}
                accessibilityRole="button"
                accessibilityLabel={`${r.label}. ${ok ? "Ready" : "Tap for details"}`}
              >
                <Ionicons name={ok ? "checkmark-circle" : r.icon} size={20} color={ok ? "#2E9E52" : "#C2871A"} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.readLabel}>{r.label}</Text>
                  <Text style={styles.readHint}>{ok ? r.hintReady : r.hintTodo}</Text>
                </View>
                <Text style={[styles.readState, { color: ok ? "#2E9E52" : "#0B6E8F" }]}>
                  {ok ? "Ready" : "Learn more"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#C5D0D6" />
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Full platform backup</Text>
        <Text style={styles.sectionHint}>
          One file with every society, user, bill and visitor. Use it if the database is lost. It is not a per-society
          report — that is further down this page.
        </Text>
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
                <Meta label="File lock" value={last.encrypted ? "On" : "Off"} />
              </View>

              <View style={styles.storeBox}>
                <Text style={styles.storeLabel}>Where it is stored</Text>
                <Text style={styles.storeValue}>{storedIn}</Text>
              </View>

              {!!last.sha256 && (
                <TouchableOpacity style={styles.fpRow} onPress={() => copyFingerprint(last.sha256)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storeLabel}>Fingerprint</Text>
                    <Text style={styles.fpValue}>{shortFp(last.sha256)}</Text>
                    <Text style={styles.fpHint}>
                      A unique code for this file. Use it to check the copy you saved was not changed. Tap to copy the
                      full code — you do not need to read it.
                    </Text>
                  </View>
                  <Ionicons name="copy-outline" size={18} color="#0B6E8F" />
                </TouchableOpacity>
              )}

              {!!last.url && (
                <TouchableOpacity style={styles.linkBtn} onPress={() => openPastLink(last.id)}>
                  <Ionicons name="open-outline" size={16} color="#0B6E8F" />
                  <Text style={styles.linkBtnText}>Open cloud download link</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.empty}>No platform backup yet. Run one now, then save or email the copy.</Text>
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

          <View style={styles.secondaryRow}>
            <TouchableOpacity style={[styles.secondaryBtn, saving && { opacity: 0.6 }]} onPress={saveCopy} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#0B6E8F" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color="#0B6E8F" />
                  <Text style={styles.secondaryText}>Save a copy</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() =>
                openCompose({
                  title: "Email backup",
                  subject: `GateMate platform backup — ${new Date().toISOString().slice(0, 10)}`,
                  body: backupEmailBody({ last }),
                  recipients: defaultTo,
                })
              }
            >
              <Ionicons name="mail-outline" size={16} color="#0B6E8F" />
              <Text style={styles.secondaryText}>Email via Gmail</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.runHint}>
            Running a backup creates a fresh snapshot. It is not kept in the cloud until a cloud folder is connected —
            save it to this phone or email it so you have a copy.
          </Text>
        </View>

        {status?.history?.length > 1 && (
          <>
            <Text style={styles.sectionTitle}>Recent backups</Text>
            <View style={styles.card}>
              {status.history.map((h, i) => (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.histRow, i > 0 && styles.readRowBorder]}
                  onPress={() => (h.url ? openPastLink(h.id) : copyFingerprint(h.sha256))}
                >
                  <Ionicons
                    name={h.ok ? "document-lock-outline" : "close-circle-outline"}
                    size={16}
                    color={h.ok ? "#0B6E8F" : "#B44"}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histWhen}>{fmt(h.at)}</Text>
                    <Text style={styles.histMeta}>
                      {humanSize(h.sizeBytes)} · {h.stats?.totalRows ?? "—"} records
                      {h.url ? " · in cloud" : " · record only"}
                    </Text>
                  </View>
                  {h.url ? <Ionicons name="open-outline" size={16} color="#9AA7AF" /> : null}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Per-society backup</Text>
        <Text style={styles.sectionHint}>A smaller snapshot of one society, opened in Gmail for you to send.</Text>
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

      <InfoSheet
        item={infoItem}
        ready={infoItem ? !!readiness[infoItem.key] : false}
        onClose={() => setInfoItem(null)}
        onCompose={() =>
          openCompose({
            title: "Email backup",
            subject: `GateMate platform backup — ${new Date().toISOString().slice(0, 10)}`,
            body: backupEmailBody({ last }),
            recipients: defaultTo,
          })
        }
      />

      <ComposeSheet
        value={compose}
        onChange={setCompose}
        onClose={() => setCompose(null)}
        onSend={sendCompose}
      />
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

function InfoSheet({ item, ready, onClose, onCompose }) {
  if (!item) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name={item.icon || "information-circle-outline"} size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{item.title}</Text>
          </LinearGradient>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.statusPill, { backgroundColor: ready ? "#E8F7EE" : "#FFF6E8" }]}>
              <Text style={{ color: ready ? "#2E9E52" : "#C2871A", fontWeight: "800", fontSize: 12 }}>
                {ready ? "Ready" : "Not set up on the server"}
              </Text>
            </View>
            <Text style={styles.modalText}>{item.body}</Text>
            {item.compose ? (
              <TouchableOpacity style={styles.runBtn} onPress={onCompose}>
                <Ionicons name="mail-outline" size={18} color="#fff" />
                <Text style={styles.runText}>Open Gmail</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.linkBtn} onPress={onClose}>
              <Text style={styles.linkBtnText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

function ComposeSheet({ value, onChange, onClose, onSend }) {
  if (!value) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="mail-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{value.title}</Text>
          </LinearGradient>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalText}>
              Opens Gmail or your default mail app. Send from {OWNER_EMAIL}. Add or change recipients below — they
              appear in the To field, and you can still edit them before sending.
            </Text>
            <Text style={styles.inputLabel}>To (recipient emails)</Text>
            <TextInput
              style={styles.input}
              value={value.recipients}
              onChangeText={(recipients) => onChange({ ...value, recipients })}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder={OWNER_EMAIL}
              multiline
            />
            <Text style={styles.fpHint}>Separate multiple emails with a comma.</Text>
            <TouchableOpacity style={styles.runBtn} onPress={onSend}>
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={styles.runText}>Open Gmail</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={onClose}>
              <Text style={styles.linkBtnText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#5A6B75",
    marginTop: 18,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHint: { color: "#6B7B85", fontSize: 12.5, marginTop: -4, marginBottom: 8, lineHeight: 18 },
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
  storeBox: { backgroundColor: "#F6F9FA", borderRadius: 10, padding: 12, marginTop: 12 },
  storeLabel: { color: "#8895A0", fontSize: 11, fontWeight: "700" },
  storeValue: { color: "#1B2B33", fontSize: 13.5, fontWeight: "700", marginTop: 4, lineHeight: 19 },
  fpRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F6F9FA",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  fpValue: { color: "#1B2B33", fontWeight: "800", fontSize: 16, marginTop: 2, fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  fpHint: { color: "#6B7B85", fontSize: 11.5, marginTop: 6, lineHeight: 16 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#EAF4F7",
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 12,
  },
  linkBtnText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0B6E8F",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 14,
  },
  runText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#EAF4F7",
    borderRadius: 10,
    paddingVertical: 12,
  },
  secondaryText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  runHint: { color: "#8895A0", fontSize: 12, marginTop: 8, lineHeight: 17 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  histWhen: { color: "#1B2B33", fontWeight: "700", fontSize: 13 },
  histMeta: { color: "#8895A0", fontSize: 11.5, marginTop: 1 },
  socRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  socName: { color: "#1B2B33", fontWeight: "700", fontSize: 14 },
  socMeta: { color: "#8895A0", fontSize: 11.5, marginTop: 1 },
  emailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EAF4F7",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emailBtnText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  empty: { color: "#6B7B85", textAlign: "center", paddingVertical: 8 },
  overlay: { flex: 1, backgroundColor: "rgba(7,20,28,0.45)", justifyContent: "center", padding: 18 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", maxHeight: "88%" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  modalHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { color: "#fff", fontWeight: "800", fontSize: 16, flex: 1 },
  modalBody: { padding: 16, paddingBottom: 22 },
  modalText: { color: "#33444C", fontSize: 14, lineHeight: 21 },
  statusPill: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 12 },
  inputLabel: { color: "#5A6B75", fontWeight: "700", fontSize: 12, marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D5DEE3",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 14,
  },
});
