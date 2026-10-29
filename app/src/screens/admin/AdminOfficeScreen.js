import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";
import { reminderResult } from "../../lib/reminderCopy";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

export default function AdminOfficeScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const L = labelsFor(user);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [remindNote, setRemindNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.adminOffice();
      setData(res);
      setDays(res.visitorRetentionDays ? String(res.visitorRetentionDays) : "");
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

  const saveRetention = async () => {
    setSaving(true);
    try {
      await api.adminOfficeSettings({ visitorRetentionDays: days === "" ? null : Number(days) });
      Alert.alert("Saved", days ? `Visitor details will be erased after ${days} days.` : "Visitor records will be kept.");
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const remind = async () => {
    setRemindNote("");
    try {
      const res = await api.adminRemindUnpaid();
      const message = reminderResult(res, L);
      setRemindNote(message);
      if (typeof window !== "undefined" && window.alert) window.alert(`Reminders\n\n${message}`);
    } catch (e) {
      const message = e.message || "Could not send reminders.";
      setRemindNote(message);
      if (typeof window !== "undefined" && window.alert) window.alert(message);
      else Alert.alert("Error", message);
    }
  };

  const p = data?.pending || {};
  const latestMonth = (data?.collectionByMonth || []).slice(-1)[0];

  return (
    <View style={styles.container}>
      <ScreenHeader icon="briefcase" title="Society office" subtitle="Dues, moves, vendors & reports" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.section}>Income</Text>
        <View style={styles.grid}>
          <MoneyCard label="Total dues" value={money(data?.totalPending)} color="#C99000" />
          <MoneyCard label="Overdue" value={money(data?.overdue)} color="#B42318" />
          <MoneyCard label="Advance" value={money(data?.advance)} color="#1E7A3D" />
          <MoneyCard label="Security deposit" value={money(data?.securityDeposit)} color="#0B6E8F" />
        </View>

        <Text style={styles.section}>Actions pending</Text>
        <View style={styles.grid}>
          <PendingCard label="New users" count={p.newUsers || 0} onPress={() => navigation.navigate("Members")} />
          <PendingCard label="Move in/out" count={p.moves || 0} onPress={() => navigation.navigate("Moves")} />
          <PendingCard label="Escalated tickets" count={p.escalated || 0} onPress={() => navigation.navigate("Community", { screen: "Helpdesk" })} />
          <PendingCard label="Payment dues" count={p.paymentIntimations || 0} onPress={() => navigation.navigate("FinanceHome")} />
        </View>

        <Text style={styles.section}>Shortcuts</Text>
        <View style={styles.shortcuts}>
          <Shortcut icon="people" label="Manage admins" onPress={() => navigation.navigate("Members")} />
          <Shortcut icon="megaphone" label="Notice board" onPress={() => navigation.navigate("Community")} />
          <Shortcut icon="cash" label="Dues tracker" onPress={() => navigation.navigate("FinanceHome")} />
          <Shortcut icon="help-buoy" label="Helpdesk" onPress={() => navigation.navigate("Community", { screen: "Helpdesk" })} />
          <Shortcut icon="calendar" label="Amenity bookings" onPress={() => navigation.navigate("Amenities")} />
          <Shortcut icon="log-in" label="Entry–exit report" onPress={() => navigation.navigate("Reports")} />
          <Shortcut icon="swap-horizontal" label="Move in/out" onPress={() => navigation.navigate("Moves")} />
          <Shortcut icon="receipt" label="Vendor bills" onPress={() => navigation.navigate("Vendors")} />
          <Shortcut icon="library" label="Accounts & Tally" onPress={() => navigation.navigate("Accounts")} />
          <Shortcut icon="file-tray-full" label="Records & polls" onPress={() => navigation.navigate("Records")} />
        </View>

        <Text style={styles.section}>This month’s collection</Text>
        {latestMonth ? (
          <View style={styles.monthCard}>
            <Text style={styles.monthTitle}>{latestMonth.period}</Text>
            <Text style={styles.monthLine}>Invoiced {money(latestMonth.invoiced)}</Text>
            <Text style={styles.monthLine}>Collected {money(latestMonth.collected)}</Text>
            <Text style={[styles.monthLine, { color: "#C2571A" }]}>Pending {money(latestMonth.pending)}</Text>
            <TouchableOpacity style={styles.remindBtn} onPress={remind}>
              <Text style={styles.remindText}>Send reminder</Text>
            </TouchableOpacity>
            {remindNote ? <Text style={styles.remindNote}>{remindNote}</Text> : null}
          </View>
        ) : null}

        <Text style={styles.section}>Defaulters</Text>
        {(data?.defaulters || []).length === 0 && <Text style={styles.empty}>No outstanding dues.</Text>}
        {(data?.defaulters || []).slice(0, 12).map((f) => (
          <TouchableOpacity key={f.flatId} style={styles.row} onPress={() => navigation.navigate("FlatLedger", { flatId: f.flatId })}>
            <Text style={styles.rowTitle}>{f.flatNo}{f.block ? ` · ${f.block}` : ""}</Text>
            <Text style={styles.rowAmt}>{money(f.pending)}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.section}>Visitor data erasure</Text>
        <Text style={styles.hint}>Erase names, phones and photos after a set number of days. Pending visitors at the gate are never erased. Leave blank to keep records.</Text>
        <View style={styles.retainRow}>
          <TextInput
            style={styles.input}
            value={days}
            onChangeText={setDays}
            keyboardType="number-pad"
            placeholder="Days (e.g. 90)"
          />
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveRetention} disabled={saving}>
            <Text style={styles.saveText}>{saving ? "Saving…" : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function MoneyCard({ label, value, color }) {
  return (
    <View style={styles.moneyCard}>
      <Text style={styles.moneyLabel}>{label}</Text>
      <Text style={[styles.moneyValue, { color }]}>{value}</Text>
    </View>
  );
}

function PendingCard({ label, count, onPress }) {
  return (
    <TouchableOpacity style={styles.pending} onPress={onPress}>
      <Text style={styles.pendingCount}>{count}</Text>
      <Text style={styles.pendingLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Shortcut({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.shortcut} onPress={onPress}>
      <Ionicons name={icon} size={18} color="#0B6E8F" />
      <Text style={styles.shortcutLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  section: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 18, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moneyCard: { width: "48%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  moneyLabel: { color: "#6B7B85", fontWeight: "700", fontSize: 12 },
  moneyValue: { fontSize: 18, fontWeight: "800", marginTop: 6 },
  pending: { width: "48%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  pendingCount: { fontSize: 22, fontWeight: "800", color: "#0B6E8F" },
  pendingLabel: { color: "#48606B", fontWeight: "600", marginTop: 4, fontSize: 13 },
  shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shortcut: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10 },
  shortcutLabel: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  monthCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  monthTitle: { fontWeight: "800", fontSize: 16, color: "#1B2B33", marginBottom: 8 },
  monthLine: { color: "#334", fontWeight: "600", marginTop: 2 },
  remindBtn: { marginTop: 14, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  remindText: { color: "#fff", fontWeight: "800" },
  remindNote: { marginTop: 10, color: "#1B2B33", lineHeight: 20, fontSize: 13 },
  empty: { color: "#6B7B85" },
  row: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 },
  rowTitle: { fontWeight: "700", color: "#1B2B33" },
  rowAmt: { fontWeight: "800", color: "#B42318" },
  hint: { color: "#6B7B85", fontSize: 13, lineHeight: 18, marginBottom: 10 },
  retainRow: { flexDirection: "row", gap: 10 },
  input: { flex: 1, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#D6DEE3", paddingHorizontal: 12, paddingVertical: 10 },
  saveBtn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  saveText: { color: "#fff", fontWeight: "800" },
});
