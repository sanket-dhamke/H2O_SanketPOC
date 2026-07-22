import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  RefreshControl,
  Share,
  Linking,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const SLOTS = [
  { id: "full_day", label: "Full day" },
  { id: "half_day", label: "Half day" },
];
const STATUS_COLORS = {
  requested: "#C2571A",
  approved: "#0B6E8F",
  paid: "#2E9E52",
  completed: "#2E9E52",
  rejected: "#B42318",
  cancelled: "#8895A0",
};

export default function VenueMarketplaceScreen() {
  const navigation = useNavigation();
  const [premium, setPremium] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.adminVenueBookings();
      setPremium(r.premium);
      setBookings(r.bookings || []);
      setSummary(r.summary);
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

  const setStatus = async (b, status) => {
    try {
      await api.adminUpdateVenueBooking(b.id, { status });
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const makeLink = async (b) => {
    try {
      const r = await api.adminVenuePaymentLink(b.id);
      if (r.enabled === false) {
        Alert.alert("Razorpay not set up", r.message || "Record the payment manually with 'Mark paid'.");
        return;
      }
      await load();
      const routedNote = r.routed
        ? `\n\n90% (${money(b.societyNet)}) will settle to the society; H2O keeps the ${b.platformFeePct}% fee.`
        : "\n\n(Society bank account not linked to Razorpay Route yet — full amount settles to the platform account; settle the society's share manually.)";
      Alert.alert("Payment link ready", `Share this with ${b.vendorName}:\n${r.url}${routedNote}`, [
        { text: "Close" },
        { text: "Share", onPress: () => Share.share({ message: `Payment for ${b.venueName} on ${b.date}: ${r.url}` }) },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const checkPayment = async (b) => {
    try {
      const r = await api.adminVenueSync(b.id);
      if (r.enabled === false) {
        Alert.alert("Razorpay not set up", "Use 'Mark paid' to record it manually.");
        return;
      }
      if (r.paid) {
        Alert.alert("Payment received ✔", "The booking is now marked paid.");
        load();
      } else {
        Alert.alert("Not paid yet", `Payment link status: ${r.status || "pending"}.`);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const remove = (b) => {
    Alert.alert("Delete booking?", `Remove ${b.vendorName}'s booking?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.adminDeleteVenueBooking(b.id);
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const header = (
    <ScreenHeader
      icon="storefront"
      title="Vendor marketplace"
      subtitle="Rent society premises to vendors"
      onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
      right={
        premium ? (
          <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        ) : null
      }
    />
  );

  if (!premium) {
    return (
      <View style={styles.container}>
        {header}
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={styles.upsell}>
            <Ionicons name="lock-closed" size={40} color="#0B6E8F" />
            <Text style={styles.upsellTitle}>Premium feature</Text>
            <Text style={styles.upsellText}>
              The vendor venue marketplace lets outside vendors (decorators, event
              companies, etc.) book your community hall or grounds and pay the society —
              with H2O keeping a small platform fee (10%).
            </Text>
            <Text style={styles.upsellText}>
              This is part of the <Text style={{ fontWeight: "800" }}>H2O Premium</Text> plan.
              Ask the H2O team to enable premium for your society.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {summary && (
          <View style={styles.summaryRow}>
            <View style={styles.sumBox}>
              <Text style={styles.sumLabel}>Society earnings</Text>
              <Text style={[styles.sumVal, { color: "#2E9E52" }]}>{money(summary.societyEarnings)}</Text>
            </View>
            <View style={styles.sumBox}>
              <Text style={styles.sumLabel}>H2O fees</Text>
              <Text style={styles.sumVal}>{money(summary.platformFees)}</Text>
            </View>
            <View style={styles.sumBox}>
              <Text style={styles.sumLabel}>Bookings</Text>
              <Text style={styles.sumVal}>{summary.total}</Text>
            </View>
          </View>
        )}

        {bookings.length === 0 && <Text style={styles.empty}>No vendor bookings yet. Tap + to add one.</Text>}

        {bookings.map((b) => (
          <View key={b.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vendor}>{b.vendorName}</Text>
                <Text style={styles.meta}>
                  {b.venueName} · {b.date} · {b.slot === "half_day" ? "Half day" : b.slot === "full_day" ? "Full day" : b.slot}
                </Text>
                {!!b.purpose && <Text style={styles.meta}>{b.purpose}</Text>}
                {!!b.vendorPhone && <Text style={styles.meta}>📞 {b.vendorPhone}</Text>}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[b.status] || "#0B6E8F") + "22" }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[b.status] || "#0B6E8F" }]}>{b.status}</Text>
              </View>
            </View>

            <View style={styles.feeRow}>
              <Fee label="Amount" value={money(b.amount)} />
              <Fee label={`H2O fee (${b.platformFeePct}%)`} value={money(b.platformFee)} />
              <Fee label="Society gets" value={money(b.societyNet)} strong />
            </View>

            {!!b.paymentLinkUrl && !["paid", "completed"].includes(b.status) && (
              <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(b.paymentLinkUrl)}>
                <Ionicons name="link-outline" size={15} color="#0B6E8F" />
                <Text style={styles.linkText} numberOfLines={1}>{b.paymentLinkUrl}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.actions}>
              {b.status === "requested" && (
                <>
                  <Act icon="checkmark-circle-outline" label="Approve" color="#0B6E8F" onPress={() => setStatus(b, "approved")} />
                  <Act icon="close-circle-outline" label="Reject" color="#B42318" onPress={() => setStatus(b, "rejected")} />
                </>
              )}
              {["requested", "approved"].includes(b.status) && b.amount > 0 && (
                <Act icon="card-outline" label={b.paymentLinkUrl ? "Resend link" : "Payment link"} color="#0B6E8F" onPress={() => makeLink(b)} />
              )}
              {!!b.paymentLinkUrl && !["paid", "completed"].includes(b.status) && (
                <Act icon="refresh-outline" label="Check payment" color="#0B6E8F" onPress={() => checkPayment(b)} />
              )}
              {b.status === "approved" && (
                <Act icon="cash-outline" label="Mark paid" color="#2E9E52" onPress={() => setStatus(b, "paid")} />
              )}
              {b.status === "paid" && (
                <Act icon="flag-outline" label="Mark completed" color="#2E9E52" onPress={() => setStatus(b, "completed")} />
              )}
              <Act icon="trash-outline" label="Delete" color="#8895A0" onPress={() => remove(b)} />
            </View>
          </View>
        ))}
      </ScrollView>

      <AddBookingModal visible={modal} onClose={() => setModal(false)} onDone={load} />
    </View>
  );
}

function Fee({ label, value, strong }) {
  return (
    <View style={styles.feeBox}>
      <Text style={styles.feeLabel}>{label}</Text>
      <Text style={[styles.feeVal, strong && { color: "#2E9E52", fontWeight: "800" }]}>{value}</Text>
    </View>
  );
}

function Act({ icon, label, color, onPress }) {
  return (
    <TouchableOpacity style={styles.act} onPress={onPress}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[styles.actText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AddBookingModal({ visible, onClose, onDone }) {
  const [f, setF] = useState({ venueName: "", vendorName: "", vendorPhone: "", vendorEmail: "", purpose: "", date: "", slot: "full_day", amount: "", platformFeePct: "10" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const amount = Number(f.amount) || 0;
  const pct = Number(f.platformFeePct) || 0;
  const fee = Math.round(amount * pct) / 100;

  const submit = async () => {
    if (!f.venueName.trim() || !f.vendorName.trim() || !f.date.trim()) {
      Alert.alert("Missing info", "Venue, vendor name and date are required.");
      return;
    }
    setBusy(true);
    try {
      await api.adminCreateVenueBooking({
        venueName: f.venueName.trim(),
        vendorName: f.vendorName.trim(),
        vendorPhone: f.vendorPhone.trim() || undefined,
        vendorEmail: f.vendorEmail.trim() || undefined,
        purpose: f.purpose.trim() || undefined,
        date: f.date.trim(),
        slot: f.slot,
        amount,
        platformFeePct: pct,
      });
      setF({ venueName: "", vendorName: "", vendorPhone: "", vendorEmail: "", purpose: "", date: "", slot: "full_day", amount: "", platformFeePct: "10" });
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="storefront-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>New vendor booking</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Venue / premise *</Label>
            <TextInput style={styles.input} value={f.venueName} onChangeText={set("venueName")} placeholder="Community hall / Open ground" />
            <Label>Vendor name *</Label>
            <TextInput style={styles.input} value={f.vendorName} onChangeText={set("vendorName")} placeholder="ABC Events" />
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Label>Vendor phone</Label>
                <TextInput style={styles.input} value={f.vendorPhone} onChangeText={set("vendorPhone")} placeholder="98765..." keyboardType="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Label>Date *</Label>
                <TextInput style={styles.input} value={f.date} onChangeText={set("date")} placeholder="2026-08-15" autoCapitalize="none" />
              </View>
            </View>
            <Label>Purpose</Label>
            <TextInput style={styles.input} value={f.purpose} onChangeText={set("purpose")} placeholder="Exhibition / wedding / sale" />

            <Label>Slot</Label>
            <View style={styles.slotRow}>
              {SLOTS.map((s) => (
                <TouchableOpacity key={s.id} style={[styles.slotChip, f.slot === s.id && styles.slotChipActive]} onPress={() => set("slot")(s.id)}>
                  <Text style={[styles.slotText, f.slot === s.id && { color: "#fff" }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Label>Amount (₹)</Label>
                <TextInput style={styles.input} value={f.amount} onChangeText={set("amount")} placeholder="20000" keyboardType="number-pad" />
              </View>
              <View style={{ width: 110 }}>
                <Label>H2O fee %</Label>
                <TextInput style={styles.input} value={f.platformFeePct} onChangeText={set("platformFeePct")} keyboardType="number-pad" />
              </View>
            </View>

            {amount > 0 && (
              <Text style={styles.split}>
                Society gets {money(amount - fee)} · H2O fee {money(fee)}
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Saving…" : "Add booking"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 30 },
  upsell: { backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center", gap: 12, marginTop: 10 },
  upsellTitle: { fontSize: 18, fontWeight: "800", color: "#1B2B33" },
  upsellText: { color: "#3C5560", fontSize: 14, lineHeight: 20, textAlign: "center" },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  sumBox: { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 12 },
  sumLabel: { color: "#6B7B85", fontSize: 11 },
  sumVal: { fontSize: 16, fontWeight: "800", color: "#1B2B33", marginTop: 3 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  vendor: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  meta: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  feeRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  feeBox: { flex: 1, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 10 },
  feeLabel: { color: "#6B7B85", fontSize: 11 },
  feeVal: { fontSize: 14, fontWeight: "700", color: "#1B2B33", marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EAF4F7", borderRadius: 8, padding: 10, marginTop: 12 },
  linkText: { color: "#0B6E8F", fontSize: 12, flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  act: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EEF4F6", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  actText: { fontWeight: "700", fontSize: 12 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  row2: { flexDirection: "row", gap: 10 },
  slotRow: { flexDirection: "row", gap: 8 },
  slotChip: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  slotChipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  slotText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  split: { color: "#0B6E8F", fontWeight: "700", marginTop: 12, textAlign: "center" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
