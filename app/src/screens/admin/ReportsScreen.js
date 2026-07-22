import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { isPreschool } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";
import { downloadReceipt } from "../../lib/receipt";
import { buildWingReportHtml, buildSchoolReportHtml } from "../../lib/reportHtml";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const timeAt = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "-");

export default function ReportsScreen() {
  const { user } = useAuth();
  if (isPreschool(user)) return <SchoolReports />;
  return <SocietyReports />;
}

function SocietyReports() {
  const navigation = useNavigation();
  const [blocks, setBlocks] = useState([]);
  const [selected, setSelected] = useState("__all__");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const loadReport = useCallback(async (block) => {
    setLoading(true);
    try {
      const [{ blocks: bl }, { report: r }] = await Promise.all([
        api.adminBlocks(),
        api.adminReport(block === "__all__" ? undefined : block),
      ]);
      setBlocks(bl || []);
      setReport(r);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReport(selected);
    }, [loadReport, selected])
  );

  const pick = (block) => {
    setSelected(block);
    loadReport(block);
  };

  const exportPdf = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const { html, filename } = buildWingReportHtml(report);
      await downloadReceipt(html, filename);
    } catch (e) {
      Alert.alert("Export failed", e.message);
    } finally {
      setExporting(false);
    }
  };

  const emailBackup = async () => {
    setEmailing(true);
    try {
      const r = await api.adminEmailBackup();
      if (r.dev) {
        Alert.alert(
          "Backup generated (dev mode)",
          `No email provider is configured yet, so the backup was logged on the server instead of emailed. Once email is set up, it will go to ${r.admins} admin(s).`
        );
      } else if (r.delivered) {
        Alert.alert("Backup emailed", `A full backup was emailed to ${r.admins} admin(s).`);
      } else {
        Alert.alert("Couldn't email", r.message || "Email delivery failed. Check the email settings.");
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setEmailing(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="document-text"
        title="Reports & backup"
        subtitle="Wing-wise history & exports"
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
      />

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.sectionLabel}>Select a wing</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          <Chip label="All wings" active={selected === "__all__"} onPress={() => pick("__all__")} />
          {blocks.map((b) => (
            <Chip key={b} label={`Wing ${b}`} active={selected === b} onPress={() => pick(b)} />
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#0B6E8F" />
        ) : report ? (
          <>
            <View style={styles.kpiRow}>
              <Kpi label="Flats" value={report.totals?.flats ?? 0} />
              <Kpi label="Residents" value={report.totals?.residents ?? 0} />
            </View>
            <View style={styles.kpiRow}>
              <Kpi label="Collected" value={money(report.totals?.collected)} color="#2E9E52" />
              <Kpi label="Pending" value={money(report.totals?.pending)} color="#C2571A" />
            </View>

            <TouchableOpacity style={[styles.primaryBtn, exporting && { opacity: 0.6 }]} onPress={exportPdf} disabled={exporting}>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.primaryText}>{exporting ? "Preparing…" : `Export ${selected === "__all__" ? "society" : `Wing ${selected}`} report (PDF)`}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Flats {selected === "__all__" ? "" : `· Wing ${selected}`}</Text>
            {(report.flats || []).map((f) => (
              <View key={f.flatNo} style={styles.flatRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.flatNo}>{f.flatNo}</Text>
                  <Text style={styles.flatSub} numberOfLines={1}>
                    {f.ownerName}
                    {f.residents?.length ? ` · ${f.residents.length} resident${f.residents.length === 1 ? "" : "s"}` : ""}
                  </Text>
                </View>
                {f.pending > 0 ? (
                  <Text style={styles.due}>{money(f.pending)} due</Text>
                ) : (
                  <Text style={styles.cleared}>Cleared</Text>
                )}
              </View>
            ))}
            {(report.flats || []).length === 0 && <Text style={styles.muted}>No flats in this wing.</Text>}
          </>
        ) : null}

        {/* Backup */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Monthly backup</Text>
        <View style={styles.backupCard}>
          <Ionicons name="shield-checkmark-outline" size={22} color="#0B6E8F" />
          <Text style={styles.backupText}>
            A full society backup (all payments, expenses, members, visitors & bookings) is
            automatically emailed to every admin on the last day of each month. You can also send one now.
          </Text>
        </View>
        <TouchableOpacity style={[styles.emailBtn, emailing && { opacity: 0.6 }]} onPress={emailBackup} disabled={emailing}>
          <Ionicons name="mail-outline" size={18} color="#0B6E8F" />
          <Text style={styles.emailText}>{emailing ? "Sending…" : "Email me a full backup now"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/* -------------------------- Preschool reports --------------------------- */
function SchoolReports() {
  const navigation = useNavigation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { report: r } = await api.adminSchoolReport(30);
      setReport(r);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exportPdf = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const { html, filename } = buildSchoolReportHtml(report);
      await downloadReceipt(html, filename);
    } catch (e) {
      Alert.alert("Export failed", e.message);
    } finally {
      setExporting(false);
    }
  };

  const emailBackup = async () => {
    setEmailing(true);
    try {
      const r = await api.adminEmailBackup();
      if (r.dev) Alert.alert("Backup generated (dev mode)", `Email isn't configured yet, so the backup was logged on the server. Once set up it will go to ${r.admins} admin(s).`);
      else if (r.delivered) Alert.alert("Backup emailed", `A full backup was emailed to ${r.admins} admin(s).`);
      else Alert.alert("Couldn't email", r.message || "Email delivery failed.");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setEmailing(false);
    }
  };

  const t = report?.totals || {};
  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="document-text"
        title="Reports & backup"
        subtitle="Visitors & staff attendance"
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#0B6E8F" />
        ) : (
          <>
            <View style={styles.kpiRow}>
              <Kpi label="Visitors (30d)" value={t.visitorsTotal ?? 0} />
              <Kpi label="Today" value={t.visitorsToday ?? 0} />
            </View>
            <View style={styles.kpiRow}>
              <Kpi label="Inside now" value={t.insideNow ?? 0} color="#C2571A" />
              <Kpi label="Staff on premise" value={t.staffOnPremise ?? 0} color="#2E9E52" />
            </View>

            <TouchableOpacity style={[styles.primaryBtn, exporting && { opacity: 0.6 }]} onPress={exportPdf} disabled={exporting}>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.primaryText}>{exporting ? "Preparing…" : "Export report (PDF)"}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Recent visitors</Text>
            {(report?.visitors || []).slice(0, 25).map((v) => (
              <View key={v.id} style={styles.flatRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.flatNo}>{v.name}</Text>
                  <Text style={styles.flatSub} numberOfLines={1}>
                    {v.purpose || "Visitor"}{v.flatNo ? ` · ${v.flatNo}` : ""} · {timeAt(v.createdAt)}
                  </Text>
                </View>
                {v.exitAt ? <Text style={styles.cleared}>Out {timeAt(v.exitAt)}</Text> : <Text style={styles.due}>Inside</Text>}
              </View>
            ))}
            {(report?.visitors || []).length === 0 && <Text style={styles.muted}>No visitors yet.</Text>}

            <Text style={styles.sectionLabel}>Staff attendance (30 days)</Text>
            {(report?.staff || []).slice(0, 25).map((s) => (
              <View key={s.id} style={styles.flatRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.flatNo}>{s.name}</Text>
                  <Text style={styles.flatSub} numberOfLines={1}>
                    {s.role || "Staff"} · {s.date} · In {timeAt(s.inAt)}
                  </Text>
                </View>
                {s.outAt ? <Text style={styles.cleared}>Out {timeAt(s.outAt)}</Text> : <Text style={styles.due}>On premise</Text>}
              </View>
            ))}
            {(report?.staff || []).length === 0 && <Text style={styles.muted}>No staff attendance yet.</Text>}
          </>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Monthly backup</Text>
        <View style={styles.backupCard}>
          <Ionicons name="shield-checkmark-outline" size={22} color="#0B6E8F" />
          <Text style={styles.backupText}>
            A full backup (visitors, staff attendance, fees, members & bookings) is emailed to every
            admin on the last day of each month. You can also send one now.
          </Text>
        </View>
        <TouchableOpacity style={[styles.emailBtn, emailing && { opacity: 0.6 }]} onPress={emailBackup} disabled={emailing}>
          <Ionicons name="mail-outline" size={18} color="#0B6E8F" />
          <Text style={styles.emailText}>{emailing ? "Sending…" : "Email me a full backup now"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Kpi({ label, value, color }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color && { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  sectionLabel: { color: "#6B7B85", fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 18, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  chipText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  kpiRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  kpi: { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 14 },
  kpiLabel: { color: "#6B7B85", fontSize: 12 },
  kpiValue: { color: "#1B2B33", fontSize: 20, fontWeight: "800", marginTop: 4 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 14, marginTop: 16 },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  flatRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8 },
  flatNo: { fontWeight: "800", color: "#1B2B33" },
  flatSub: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
  due: { color: "#C2571A", fontWeight: "800" },
  cleared: { color: "#2E9E52", fontWeight: "700", fontSize: 13 },
  muted: { color: "#8895A0", textAlign: "center", marginTop: 12 },
  backupCard: { flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: "#EAF4F7", borderRadius: 12, padding: 14 },
  backupText: { flex: 1, color: "#3C5560", fontSize: 13, lineHeight: 19 },
  emailBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#0B6E8F", borderRadius: 12, paddingVertical: 13, marginTop: 12 },
  emailText: { color: "#0B6E8F", fontWeight: "800" },
});
