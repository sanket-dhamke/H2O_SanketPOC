import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

export default function AdminDashboardScreen() {
  const navigation = useNavigation();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [billModal, setBillModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.adminFinance();
      setData(res);
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

  const remind = async () => {
    setBusy(true);
    try {
      const res = await api.adminRemindUnpaid();
      Alert.alert("Reminders sent", `Notified ${res.notified} resident(s) with dues.`);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader icon="stats-chart" title="Finances" subtitle="Balance, dues & reminders" />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Society balance</Text>
        <Text style={styles.balanceValue}>{money(data?.balance)}</Text>
        <Text style={styles.balanceSub}>Collected {money(data?.totalCollected)} · Expenses {money(data?.totalExpenses)}</Text>
      </View>

      <View style={styles.statRow}>
        <Stat label="Collected" value={money(data?.totalCollected)} color="#2E9E52" />
        <Stat label="Pending" value={money(data?.totalPending)} color="#C2571A" />
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setBillModal(true)}>
          <Text style={styles.actionText}>Generate bills</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setExpenseModal(true)}>
          <Text style={styles.actionText}>Add expense</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.remindBtn, busy && { opacity: 0.6 }]}
        onPress={remind}
        disabled={busy}
      >
        <Text style={styles.remindText}>{busy ? "Sending..." : "Remind unpaid residents"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.collectBtn} onPress={() => navigation.navigate("Collections")}>
        <Ionicons name="cash-outline" size={18} color="#0B6E8F" />
        <Text style={styles.collectText}>Record cash / view collections</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.collectBtn} onPress={() => navigation.navigate("Amenities")}>
        <Ionicons name="calendar-outline" size={18} color="#0B6E8F" />
        <Text style={styles.collectText}>Amenities & clubhouse bookings</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Flat-wise status</Text>
      {(data?.perFlat || []).map((f) => (
        <View key={f.flatId} style={styles.flatRow}>
          <Text style={styles.flatNo}>{f.flatNo}</Text>
          <Text style={styles.flatPaid}>Paid {money(f.paid)}</Text>
          <Text style={[styles.flatPending, f.pending > 0 && { color: "#C2571A" }]}>
            {f.pending > 0 ? `Due ${money(f.pending)}` : "Clear"}
          </Text>
        </View>
      ))}
      {data && data.dueList?.length === 0 && (
        <Text style={styles.allClear}>All flats are up to date.</Text>
      )}
      </ScrollView>

      <GenerateBillsModal
        visible={billModal}
        onClose={() => setBillModal(false)}
        onDone={load}
      />
      <AddExpenseModal
        visible={expenseModal}
        onClose={() => setExpenseModal(false)}
        onDone={load}
      />
    </View>
  );
}

function Stat({ label, value, color }) {
  return (
    <View style={[styles.stat, { borderTopColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function GenerateBillsModal({ visible, onClose, onDone }) {
  const [period, setPeriod] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!period.trim() || !amount.trim()) {
      Alert.alert("Missing info", "Enter the period (YYYY-MM) and amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.adminGenerateBills({ period: period.trim(), amount: Number(amount) });
      Alert.alert("Done", `Created ${res.created} new bill(s).`);
      setPeriod("");
      setAmount("");
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal visible={visible} onClose={onClose} title="Generate monthly bills" icon="receipt-outline" busy={busy} onSubmit={submit}>
      <Label>Period (YYYY-MM)</Label>
      <TextInput style={styles.input} value={period} onChangeText={setPeriod} placeholder="2026-08" autoCapitalize="none" />
      <Label>Amount per flat (Rs.)</Label>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="2500" keyboardType="numeric" />
    </FormModal>
  );
}

function AddExpenseModal({ visible, onClose, onDone }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim() || !amount.trim()) {
      Alert.alert("Missing info", "Enter a label and amount.");
      return;
    }
    setBusy(true);
    try {
      await api.adminAddExpense({ label: label.trim(), amount: Number(amount) });
      setLabel("");
      setAmount("");
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal visible={visible} onClose={onClose} title="Add society expense" icon="cash-outline" busy={busy} onSubmit={submit}>
      <Label>Label</Label>
      <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Lift AMC" />
      <Label>Amount (Rs.)</Label>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="3500" keyboardType="numeric" />
    </FormModal>
  );
}

function FormModal({ visible, onClose, title, icon, children, busy, onSubmit }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient
            colors={["#0E85AC", "#0B6E8F", "#075064"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modalHeader}
          >
            <View style={styles.modalHeaderIcon}>
              <Ionicons name={icon || "create-outline"} size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{title}</Text>
          </LinearGradient>
          <View style={styles.modalBody}>
            {children}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={onSubmit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  title: { fontSize: 22, fontWeight: "800", color: "#1B2B33", marginBottom: 14 },
  balanceCard: { backgroundColor: "#0B6E8F", borderRadius: 16, padding: 22 },
  balanceLabel: { color: "#CDE9F2", fontSize: 13 },
  balanceValue: { color: "#fff", fontSize: 34, fontWeight: "800", marginTop: 4 },
  balanceSub: { color: "#CDE9F2", fontSize: 12, marginTop: 6 },
  statRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  stat: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 16, borderTopWidth: 4 },
  statValue: { fontSize: 20, fontWeight: "800", color: "#1B2B33" },
  statLabel: { color: "#6B7B85", marginTop: 4, fontSize: 12 },
  actionsRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  actionBtn: { flex: 1, backgroundColor: "#fff", borderRadius: 10, paddingVertical: 14, alignItems: "center", elevation: 1 },
  actionText: { color: "#0B6E8F", fontWeight: "700" },
  remindBtn: { backgroundColor: "#C2571A", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  remindText: { color: "#fff", fontWeight: "700" },
  collectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#fff", borderRadius: 10, paddingVertical: 14, marginTop: 12, borderWidth: 1, borderColor: "#CFE0E6" },
  collectText: { color: "#0B6E8F", fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1B2B33", marginTop: 26, marginBottom: 10 },
  flatRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8 },
  flatNo: { flex: 1, fontWeight: "700", color: "#1B2B33" },
  flatPaid: { color: "#6B7B85", fontSize: 13, marginRight: 12 },
  flatPending: { color: "#2E9E52", fontSize: 13, fontWeight: "700" },
  allClear: { color: "#6B7B85", textAlign: "center", marginTop: 8 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
