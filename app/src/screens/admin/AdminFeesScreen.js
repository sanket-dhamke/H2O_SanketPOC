import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  Platform,
  Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function notify(title, message) {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export default function AdminFeesScreen({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const [data, setData] = useState({ students: [], summary: {} });
  const [wa, setWa] = useState(null); // { enabled, mode, businessNumber }
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(null); // student object
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.adminFees();
      setData(res);
    } catch (e) {
      notify("Error", e.message);
    }
    try {
      setWa(await api.adminWhatsappStatus());
    } catch {
      // Non-fatal: leave the badge hidden if status can't be fetched.
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const runReminders = async () => {
    setRunning(true);
    try {
      const r = await api.adminRunFeeReminders();
      notify(
        "Reminders processed",
        `Due today: ${r.attempted}. WhatsApp sent: ${r.sent}.` +
          (r.sent === 0 && r.attempted > 0 ? "\n\n(WhatsApp API not configured yet — messages were prepared in dev mode. Use 'Remind' on a student to send manually.)" : "")
      );
      load();
    } catch (e) {
      notify("Error", e.message);
    } finally {
      setRunning(false);
    }
  };

  // Group students by class.
  const groups = useMemo(() => {
    const map = {};
    for (const s of data.students || []) {
      const k = s.class || "Unassigned";
      (map[k] = map[k] || []).push(s);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [data.students]);

  const { totalFees = 0, totalCollected = 0, totalBalance = 0, count = 0 } = data.summary || {};

  return (
    <View style={styles.container}>
      <ScreenHeader icon="cash" title={`${L.fees} — ${L.units}`} subtitle={`${count} ${L.units.toLowerCase()} · fee tracking`} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {wa && <WhatsappBadge wa={wa} />}

        <View style={styles.kpiRow}>
          <Kpi label="Total fees" value={money(totalFees)} tint="#0B6E8F" />
          <Kpi label="Collected" value={money(totalCollected)} tint="#2E9E52" />
          <Kpi label="Pending" value={money(totalBalance)} tint="#C2571A" />
        </View>

        <TouchableOpacity style={[styles.runBtn, running && { opacity: 0.6 }]} onPress={runReminders} disabled={running}>
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          <Text style={styles.runText}>{running ? "Processing…" : "Send due reminders now"}</Text>
        </TouchableOpacity>

        {groups.length === 0 && (
          <Text style={styles.empty}>No {L.units.toLowerCase()} yet. Add them from {L.members} → {L.units}.</Text>
        )}

        {groups.map(([cls, students]) => (
          <View key={cls} style={{ marginTop: 18 }}>
            <Text style={styles.className}>{cls} · {students.length}</Text>
            {students.map((s) => (
              <StudentCard key={s.flatId} student={s} onManage={() => setEditing(s)} onRemind={() => remind(s, load)} L={L} />
            ))}
          </View>
        ))}
      </ScrollView>

      <FeeEditorModal student={editing} onClose={() => setEditing(null)} onDone={load} L={L} />
    </View>
  );
}

async function remind(student, reload) {
  const bill = student.bill;
  if (!bill) return notify("No fee set", "Set this student's fee first, then send a reminder.");
  try {
    const r = await api.adminRemindBill(bill.id);
    if (r.sent) {
      notify("Reminder sent", `WhatsApp reminder sent to ${student.guardianName || "guardian"}.`);
    } else if (r.link) {
      // Not configured / failed → offer the click-to-send fallback.
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.open(r.link, "_blank");
      } else {
        Linking.openURL(r.link).catch(() => {});
      }
    } else {
      notify("Couldn't send", r.error || "No guardian phone on file.");
    }
  } catch (e) {
    notify("Error", e.message);
  } finally {
    reload && reload();
  }
}

function StudentCard({ student, onManage, onRemind }) {
  const b = student.bill;
  const status = b ? b.status : "none";
  const pill = {
    paid: { bg: "#E7F6EC", fg: "#1E7A3D", label: "Paid" },
    partial: { bg: "#FEF3E2", fg: "#B0620B", label: "Partial" },
    pending: { bg: "#FDEAE6", fg: "#B4381F", label: "Pending" },
    none: { bg: "#EEF2F4", fg: "#6B7B85", label: "No fee set" },
  }[status];
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.studentName}>{student.name}</Text>
          <Text style={styles.guardian}>
            {student.guardianName || "No guardian"}{student.guardianPhone ? ` · ${student.guardianPhone}` : ""}
            {student.hasParentLogin ? "  ·  📱 has login" : ""}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.pillText, { color: pill.fg }]}>{pill.label}</Text>
        </View>
      </View>

      {b && (
        <View style={styles.feeRow}>
          <FeeCell label="Total" value={money(b.amount)} />
          <FeeCell label="Paid" value={money(b.paidAmount)} tint="#2E9E52" />
          <FeeCell label="Balance" value={money(b.balance)} tint="#C2571A" />
        </View>
      )}
      {b && (b.nextDueAmount || b.remindOn) && (
        <Text style={styles.installLine}>
          {b.nextDueAmount ? `Next installment ${money(b.nextDueAmount)}` : "Full balance due"}
          {b.remindOn ? `  ·  reminder on ${b.remindOn}` : ""}
        </Text>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.ghostBtn} onPress={onManage}>
          <Ionicons name="create-outline" size={15} color="#0B6E8F" />
          <Text style={styles.ghostText}>{b ? "Manage fee" : "Set fee"}</Text>
        </TouchableOpacity>
        {b && b.status !== "paid" && (
          <TouchableOpacity style={styles.ghostBtn} onPress={onRemind}>
            <Ionicons name="logo-whatsapp" size={15} color="#1E7A3D" />
            <Text style={[styles.ghostText, { color: "#1E7A3D" }]}>Remind</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function FeeEditorModal({ student, onClose, onDone, L }) {
  const visible = !!student;
  const bill = student?.bill || null;
  const [amount, setAmount] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [remindOn, setRemindOn] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [collectedBy, setCollectedBy] = useState("");
  const [busy, setBusy] = useState(false);

  // Sync form when opening for a new student.
  React.useEffect(() => {
    if (student) {
      setAmount(bill ? String(bill.amount) : "");
      setNextDue(bill?.nextDueAmount ? String(bill.nextDueAmount) : "");
      setRemindOn(bill?.remindOn || "");
      setPayAmount("");
      setCollectedBy("");
    }
  }, [student]);

  const saveFee = async () => {
    if (!amount || Number(amount) <= 0) return notify("Missing", "Enter the total fee amount.");
    if (remindOn && !/^\d{4}-\d{2}-\d{2}$/.test(remindOn.trim())) {
      return notify("Invalid date", "Reminder date must be YYYY-MM-DD, e.g. 2026-08-05.");
    }
    setBusy(true);
    try {
      const payload = {
        amount: Number(amount),
        nextDueAmount: nextDue === "" ? null : Number(nextDue),
        remindOn: remindOn.trim() || null,
      };
      if (bill) await api.adminUpdateBill(bill.id, payload);
      else await api.adminSetFee({ flatId: student.flatId, ...payload });
      notify("Saved", "Fee details updated.");
      onClose();
      onDone();
    } catch (e) {
      notify("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const recordCash = async () => {
    if (!bill) return notify("Set fee first", "Save the fee before recording a payment.");
    if (!payAmount || Number(payAmount) <= 0) return notify("Missing", "Enter the amount received.");
    if (!collectedBy.trim()) return notify("Missing", "Enter who collected the payment.");
    setBusy(true);
    try {
      await api.adminMarkCash(bill.id, { amount: Number(payAmount), collectedBy: collectedBy.trim() });
      notify("Payment recorded", `${money(Number(payAmount))} received from ${student.name}.`);
      onClose();
      onDone();
    } catch (e) {
      notify("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}><Ionicons name="cash-outline" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{student?.name}</Text>
              <Text style={styles.modalSub}>{student?.class}{student?.guardianPhone ? ` · ${student.guardianPhone}` : ""}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.section}>Fee details</Text>
            <Label>Total fee (₹)</Label>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="e.g. 40000" />
            <Label>Next installment (₹) — optional</Label>
            <TextInput style={styles.input} value={nextDue} onChangeText={setNextDue} keyboardType="number-pad" placeholder="e.g. 15000 (quarterly)" />
            <Text style={styles.hint}>Leave blank to remind for the full balance.</Text>
            <Label>Reminder date (YYYY-MM-DD) — optional</Label>
            <TextInput style={styles.input} value={remindOn} onChangeText={setRemindOn} autoCapitalize="none" placeholder="2026-08-05" />
            <Text style={styles.hint}>A WhatsApp reminder is auto-sent to the guardian on this date.</Text>
            <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.6 }]} onPress={saveFee} disabled={busy}>
              <Text style={styles.saveText}>{busy ? "Saving…" : bill ? "Update fee" : "Set fee"}</Text>
            </TouchableOpacity>

            {bill && (
              <>
                <View style={styles.balanceBox}>
                  <Text style={styles.balanceText}>Paid {money(bill.paidAmount)} of {money(bill.amount)} · balance {money(bill.balance)}</Text>
                </View>
                <Text style={styles.section}>Record a cash payment</Text>
                <Label>Amount received (₹)</Label>
                <TextInput style={styles.input} value={payAmount} onChangeText={setPayAmount} keyboardType="number-pad" placeholder={`Up to ${money(bill.balance)}`} />
                <Label>Collected by</Label>
                <TextInput style={styles.input} value={collectedBy} onChangeText={setCollectedBy} placeholder="Staff / accountant name" />
                <TouchableOpacity style={[styles.saveBtn, styles.cashBtn, busy && { opacity: 0.6 }]} onPress={recordCash} disabled={busy}>
                  <Text style={styles.saveText}>Record cash payment</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function WhatsappBadge({ wa }) {
  const live = wa.enabled;
  const c = live
    ? { bg: "#E7F6EC", fg: "#1E7A3D", dot: "#25D366", label: "WhatsApp: LIVE" }
    : { bg: "#FEF3E2", fg: "#B0620B", dot: "#E0952A", label: "WhatsApp: dev mode" };
  return (
    <View style={[styles.waBadge, { backgroundColor: c.bg }]}>
      <View style={[styles.waDot, { backgroundColor: c.dot }]} />
      <Ionicons name="logo-whatsapp" size={15} color={c.fg} />
      <Text style={[styles.waLabel, { color: c.fg }]}>{c.label}</Text>
      <Text style={[styles.waSub, { color: c.fg }]} numberOfLines={1}>
        {live ? `Auto-sending via +${wa.businessNumber}` : "Reminders prepared as tap-to-send links"}
      </Text>
    </View>
  );
}

function Kpi({ label, value, tint }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, { color: tint }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}
function FeeCell({ label, value, tint }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.feeLabel}>{label}</Text>
      <Text style={[styles.feeValue, tint && { color: tint }]}>{value}</Text>
    </View>
  );
}
function Label({ children }) {
  return <Text style={styles.formLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  waBadge: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  waDot: { width: 8, height: 8, borderRadius: 4 },
  waLabel: { fontWeight: "800", fontSize: 12.5 },
  waSub: { flex: 1, fontSize: 11, opacity: 0.85 },
  kpiRow: { flexDirection: "row", gap: 10 },
  kpi: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 14, alignItems: "center" },
  kpiValue: { fontSize: 17, fontWeight: "800" },
  kpiLabel: { color: "#6B7B85", fontSize: 11, marginTop: 3 },
  runBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#1E7A3D", borderRadius: 12, paddingVertical: 13, marginTop: 14 },
  runText: { color: "#fff", fontWeight: "700" },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 40 },
  className: { fontSize: 13, fontWeight: "800", color: "#42525B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  studentName: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  guardian: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
  pill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: "800" },
  feeRow: { flexDirection: "row", marginTop: 12, backgroundColor: "#F8FAFB", borderRadius: 10, padding: 10 },
  feeLabel: { color: "#8895A0", fontSize: 11 },
  feeValue: { color: "#1B2B33", fontSize: 15, fontWeight: "800", marginTop: 2 },
  installLine: { color: "#42525B", fontSize: 12, marginTop: 8, fontWeight: "600" },
  cardActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EFF5F7", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  ghostText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },

  overlay: { flex: 1, backgroundColor: "rgba(6,20,26,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "92%", overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  modalSub: { color: "#CDE7F0", fontSize: 12, marginTop: 2 },
  section: { fontSize: 14, fontWeight: "800", color: "#1B2B33", marginTop: 10, marginBottom: 4 },
  formLabel: { fontSize: 12, fontWeight: "700", color: "#42525B", marginTop: 12, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: "#F8FAFB" },
  hint: { color: "#8895A0", fontSize: 11, marginTop: 5 },
  saveBtn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  cashBtn: { backgroundColor: "#1E7A3D" },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  balanceBox: { backgroundColor: "#EFF5F7", borderRadius: 10, padding: 12, marginTop: 18 },
  balanceText: { color: "#1B2B33", fontWeight: "700", fontSize: 13, textAlign: "center" },
});
