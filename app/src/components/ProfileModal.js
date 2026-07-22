import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  Platform,
} from "react-native";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { SUPPORT, memberId } from "../lib/support";
import ChangePasswordModal from "./ChangePasswordModal";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const ROLE_LABEL = {
  resident: "Resident",
  guard: "Gate desk / Guard",
  admin: "Society admin",
  superadmin: "H2O Platform owner",
};
const ID_LABEL = { resident: "Resident ID", guard: "Staff ID", admin: "Admin ID", superadmin: "Owner ID" };

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const initials = (name) =>
  String(name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function ProfileModal({ visible, onClose }) {
  const { user, logout, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [pwModal, setPwModal] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [orders, setOrders] = useState(null);

  const isResident = user?.role === "resident";

  const loadOrders = useCallback(async () => {
    if (!isResident) return;
    try {
      const [m, b] = await Promise.all([api.maintenance(), api.bookings()]);
      const bills = (m.bills || [])
        .filter((x) => x.status === "paid")
        .map((x) => ({ id: `bill-${x.id}`, title: `Maintenance · ${x.period}`, amount: x.amount, date: x.paidAt, icon: "card-outline" }));
      const bookings = (b.bookings || [])
        .filter((x) => x.status === "paid")
        .map((x) => ({ id: `bk-${x.id}`, title: `${x.amenityName} · ${x.slotLabel}`, amount: x.amount, date: x.paidAt || x.date, icon: "calendar-outline" }));
      const all = [...bills, ...bookings].sort((a, b2) => new Date(b2.date) - new Date(a.date));
      setOrders(all);
    } catch {
      setOrders([]);
    }
  }, [isResident]);

  useEffect(() => {
    if (visible) loadOrders();
  }, [visible, loadOrders]);

  const toggleNotify = async (value) => {
    setNotifyBusy(true);
    try {
      const res = await api.updatePreferences({ notifyEnabled: value });
      updateUser({ notifyEnabled: res.user?.notifyEnabled ?? value });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setNotifyBusy(false);
    }
  };

  const open = (url) => Linking.openURL(url).catch(() => Alert.alert("Unavailable", `Couldn't open ${url}`));
  const sendFeedback = () => {
    const subject = encodeURIComponent(`H2O feedback — ${user?.name} (${memberId(user)})`);
    const body = encodeURIComponent(
      `\n\n—\nFrom: ${user?.name}\nRole: ${ROLE_LABEL[user?.role]}\n` +
        (user?.societyName ? `Society: ${user.societyName}\n` : "") +
        (user?.flatNo ? `Flat: ${user.flatNo}\n` : "")
    );
    open(`mailto:${SUPPORT.email}?subject=${subject}&body=${body}`);
  };

  const confirmLogout = () =>
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => { onClose(); logout(); } },
    ]);

  if (!user) return null;

  const addressLine = [user.societyName, user.societyCity].filter(Boolean).join(", ");

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <LinearGradient
          colors={["#0E85AC", "#0B6E8F", "#075064"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 14 }]}
        >
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-down" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user.name)}</Text>
          </View>
          <Text style={styles.name}>{user.name}</Text>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{ROLE_LABEL[user.role] || user.role}</Text>
          </View>
        </LinearGradient>

        <ScrollView contentContainerStyle={styles.body}>
          {/* Identity */}
          <Section title="Account details">
            <Row icon="finger-print-outline" label={ID_LABEL[user.role] || "ID"} value={memberId(user)} />
            {!!user.flatNo && <Row icon="home-outline" label="Flat" value={`${user.flatNo}${user.block ? ` · Block ${user.block}` : ""}`} />}
            {!!addressLine && <Row icon="location-outline" label="Society" value={addressLine} />}
            {!!user.societyAddress && <Row icon="map-outline" label="Address" value={user.societyAddress} />}
            <Row icon="mail-outline" label="Email" value={user.email} />
            {!!user.phone && <Row icon="call-outline" label="Phone" value={user.phone} />}
          </Section>

          {/* Preferences */}
          <Section title="Notifications">
            <View style={styles.prefRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prefTitle}>Push notifications</Text>
                <Text style={styles.prefSub}>
                  {isResident
                    ? "Visitor alerts, approvals & payment reminders"
                    : user.role === "guard"
                    ? "Resident decisions on your gate entries"
                    : "Booking requests, alerts & reminders"}
                </Text>
              </View>
              <Switch
                value={user.notifyEnabled !== false}
                onValueChange={toggleNotify}
                disabled={notifyBusy}
                trackColor={{ true: "#0B6E8F", false: "#CBD5DB" }}
                thumbColor="#fff"
              />
            </View>
            {Platform.OS === "web" && (
              <Text style={styles.note}>This preference applies to the H2O mobile app.</Text>
            )}
          </Section>

          {/* My orders — residents only */}
          {isResident && (
            <Section title="My orders & payments">
              {orders === null && <Text style={styles.muted}>Loading…</Text>}
              {orders?.length === 0 && <Text style={styles.muted}>No payments yet.</Text>}
              {orders?.slice(0, 8).map((o) => (
                <View key={o.id} style={styles.orderRow}>
                  <View style={styles.orderIcon}>
                    <Ionicons name={o.icon} size={16} color="#0B6E8F" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderTitle}>{o.title}</Text>
                    <Text style={styles.orderDate}>{fmtDate(o.date)}</Text>
                  </View>
                  <Text style={styles.orderAmt}>{money(o.amount)}</Text>
                </View>
              ))}
            </Section>
          )}

          {/* Account actions */}
          <Section title="Account & security">
            <ActionRow icon="key-outline" label="Change password" onPress={() => setPwModal(true)} />
            <ActionRow icon="log-out-outline" label="Log out" danger onPress={confirmLogout} />
          </Section>

          {/* Support & feedback */}
          <Section title="Support & feedback">
            <ActionRow icon="call-outline" label="Call support" value={SUPPORT.phone} onPress={() => open(`tel:${SUPPORT.phone.replace(/\s/g, "")}`)} />
            <ActionRow icon="mail-outline" label="Email support" value={SUPPORT.email} onPress={() => open(`mailto:${SUPPORT.email}`)} />
            <ActionRow icon="chatbox-ellipses-outline" label="Send feedback" onPress={sendFeedback} />
            <ActionRow icon="globe-outline" label="Website" value={SUPPORT.website.replace(/^https?:\/\//, "")} onPress={() => open(SUPPORT.website)} />
            <Text style={styles.note}>Support hours: {SUPPORT.hours}</Text>
          </Section>

          <Text style={styles.version}>
            H2O v{Constants.expoConfig?.version || "1.0.0"} · {ROLE_LABEL[user.role]}
          </Text>
        </ScrollView>

        <ChangePasswordModal visible={pwModal} onClose={() => setPwModal(false)} />
      </View>
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color="#7A8A93" style={{ width: 24 }} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function ActionRow({ icon, label, value, onPress, danger }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={18} color={danger ? "#B44" : "#0B6E8F"} style={{ width: 24 }} />
      <Text style={[styles.rowLabel, { flex: 1, color: danger ? "#B44" : "#1B2B33", fontWeight: "700" }]}>{label}</Text>
      {!!value && <Text style={styles.rowValueSm}>{value}</Text>}
      <Ionicons name="chevron-forward" size={16} color="#B7C1C8" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  header: { alignItems: "center", paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  closeBtn: { position: "absolute", left: 12, top: 0, padding: 10 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", marginTop: 8 },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  name: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 12 },
  roleChip: { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  roleChipText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  body: { padding: 16, paddingBottom: 32 },
  section: { marginBottom: 18 },
  sectionTitle: { color: "#6B7B85", fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EAEEF0" },
  rowLabel: { color: "#6B7B85", fontSize: 14 },
  rowValue: { flex: 1, textAlign: "right", color: "#1B2B33", fontWeight: "700", fontSize: 14 },
  rowValueSm: { color: "#6B7B85", fontSize: 13, marginRight: 4 },

  prefRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  prefTitle: { color: "#1B2B33", fontWeight: "700", fontSize: 15 },
  prefSub: { color: "#6B7B85", fontSize: 12.5, marginTop: 2 },
  note: { color: "#8895A0", fontSize: 12, paddingVertical: 10 },
  muted: { color: "#8895A0", fontSize: 13, paddingVertical: 12 },

  orderRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EAEEF0" },
  orderIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center" },
  orderTitle: { color: "#1B2B33", fontWeight: "700", fontSize: 14 },
  orderDate: { color: "#8895A0", fontSize: 12, marginTop: 2 },
  orderAmt: { color: "#2E9E52", fontWeight: "800" },

  version: { textAlign: "center", color: "#A4B0B8", fontSize: 12, marginTop: 4 },
});
