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
import * as ImagePicker from "expo-image-picker";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function notify(title, message) {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

const STATUS_UI = {
  pending: { bg: "#FEF3E2", fg: "#B0620B", label: "Pending review" },
  verified: { bg: "#E7F6EC", fg: "#1E7A3D", label: "Verified" },
  rejected: { bg: "#FDEAE6", fg: "#B4381F", label: "Rejected" },
  expired: { bg: "#EEF2F4", fg: "#6B7B85", label: "Expired" },
};

export default function RentAgreementsScreen({ navigation }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [agreements, setAgreements] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("pending"); // admin filter
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const { agreements } = await api.rentAgreements();
      setAgreements(agreements || []);
    } catch (e) {
      notify("Error", e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shown = useMemo(() => {
    if (!isAdmin || filter === "all") return agreements;
    return agreements.filter((a) => a.status === filter);
  }, [agreements, filter, isAdmin]);

  const verify = async (a, approve) => {
    const doIt = async (reason) => {
      try {
        await api.verifyRentAgreement(a.id, { approve, rejectionReason: reason });
        notify(approve ? "Verified" : "Rejected", `Flat ${a.flatNo} agreement ${approve ? "verified" : "rejected"}.`);
        load();
      } catch (e) {
        notify("Error", e.message);
      }
    };
    if (approve) return doIt();
    // Reject: optional reason (web uses prompt, native just rejects).
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const reason = window.prompt("Reason for rejection (optional):", "") || "";
      doIt(reason);
    } else {
      Alert.alert("Reject agreement?", `Flat ${a.flatNo}`, [
        { text: "Cancel", style: "cancel" },
        { text: "Reject", style: "destructive", onPress: () => doIt("") },
      ]);
    }
  };

  const runExpiry = async () => {
    try {
      const r = await api.runRentExpiry();
      notify("Expiry check done", `Checked ${r.checked}, sent ${r.notified} notice(s).`);
      load();
    } catch (e) {
      notify("Error", e.message);
    }
  };

  const openDoc = (url) => {
    if (!url) return;
    if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank");
    else Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="document-text"
        title="Rent agreements"
        subtitle={isAdmin ? "Verify tenant leases & track expiry" : "Submit & track your lease"}
        onBack={() => navigation.goBack()}
        right={
          isAdmin ? (
            <TouchableOpacity onPress={runExpiry} style={styles.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="notifications-outline" size={16} color="#fff" />
              <Text style={styles.headerBtnText}>Expiry check</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!isAdmin && (
          <TouchableOpacity style={styles.submitBtn} onPress={() => setShowForm(true)}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.submitText}>Submit a rent agreement</Text>
          </TouchableOpacity>
        )}

        {isAdmin && (
          <View style={styles.filterRow}>
            {["pending", "verified", "all"].map((f) => (
              <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f[0].toUpperCase() + f.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {shown.length === 0 && (
          <Text style={styles.empty}>
            {isAdmin ? "No agreements here." : "No rent agreement yet. Tap ‘Submit a rent agreement’ to add one for your flat."}
          </Text>
        )}

        {shown.map((a) => {
          const ui = STATUS_UI[a.status] || STATUS_UI.pending;
          const expiringSoon = a.status === "verified" && a.daysToExpiry != null && a.daysToExpiry <= 30;
          return (
            <View key={a.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.flat}>Flat {a.flatNo}{a.block ? ` · ${a.block}` : ""}</Text>
                <View style={[styles.pill, { backgroundColor: ui.bg }]}>
                  <Text style={[styles.pillText, { color: ui.fg }]}>{ui.label}</Text>
                </View>
              </View>
              <Text style={styles.tenant}>{a.tenantName}{a.tenantPhone ? ` · ${a.tenantPhone}` : ""}</Text>
              <Text style={styles.dates}>
                {a.startDate} → {a.endDate}
                {a.rentAmount != null ? `  ·  rent ${money(a.rentAmount)}/mo` : ""}
              </Text>
              {expiringSoon && (
                <Text style={styles.expiry}>
                  {a.daysToExpiry < 0 ? "Expired" : `Expires in ${a.daysToExpiry} day(s)`}
                </Text>
              )}
              {a.status === "rejected" && a.rejectionReason ? (
                <Text style={styles.reason}>Reason: {a.rejectionReason}</Text>
              ) : null}

              <View style={styles.actions}>
                {a.documentUrl ? (
                  <TouchableOpacity style={styles.ghostBtn} onPress={() => openDoc(a.documentUrl)}>
                    <Ionicons name="attach" size={15} color="#0B6E8F" />
                    <Text style={styles.ghostText}>Document</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.noDoc}>{a.documentName ? `${a.documentName} (not stored)` : "No document"}</Text>
                )}
                {isAdmin && a.status === "pending" && (
                  <>
                    <TouchableOpacity style={[styles.ghostBtn, styles.approve]} onPress={() => verify(a, true)}>
                      <Ionicons name="checkmark" size={15} color="#1E7A3D" />
                      <Text style={[styles.ghostText, { color: "#1E7A3D" }]}>Verify</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.ghostBtn, styles.reject]} onPress={() => verify(a, false)}>
                      <Ionicons name="close" size={15} color="#B4381F" />
                      <Text style={[styles.ghostText, { color: "#B4381F" }]}>Reject</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {!isAdmin && (
        <SubmitModal
          visible={showForm}
          onClose={() => setShowForm(false)}
          onDone={() => { setShowForm(false); load(); }}
        />
      )}
    </View>
  );
}

function SubmitModal({ visible, onClose, onDone }) {
  const [tenantName, setTenantName] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [doc, setDoc] = useState(null); // { base64, name }
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTenantName(""); setTenantPhone(""); setTenantEmail(""); setOwnerName("");
    setStartDate(""); setEndDate(""); setRentAmount(""); setDoc(null);
  };

  const attach = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
    if (!res.canceled && res.assets?.[0]?.base64) {
      setDoc({ base64: `data:image/jpeg;base64,${res.assets[0].base64}`, name: "agreement.jpg" });
    }
  };

  const submit = async () => {
    if (!tenantName.trim()) return notify("Missing", "Enter the tenant name.");
    const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d.trim());
    if (!dateOk(startDate) || !dateOk(endDate)) return notify("Invalid dates", "Use YYYY-MM-DD for start and end dates.");
    if (endDate.trim() <= startDate.trim()) return notify("Invalid dates", "End date must be after the start date.");
    setBusy(true);
    try {
      await api.createRentAgreement({
        tenantName: tenantName.trim(),
        tenantPhone: tenantPhone.trim(),
        tenantEmail: tenantEmail.trim(),
        ownerName: ownerName.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        rentAmount: rentAmount === "" ? null : Number(rentAmount),
        documentBase64: doc?.base64 || null,
        documentName: doc?.name || null,
      });
      notify("Submitted", "Your agreement was sent to the society admin for verification.");
      reset();
      onDone();
    } catch (e) {
      notify("Couldn't submit", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New rent agreement</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </LinearGradient>
          <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            <Label>Tenant name</Label>
            <TextInput style={styles.input} value={tenantName} onChangeText={setTenantName} placeholder="Full name" />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Label>Tenant phone</Label>
                <TextInput style={styles.input} value={tenantPhone} onChangeText={setTenantPhone} keyboardType="phone-pad" placeholder="Mobile" />
              </View>
              <View style={{ flex: 1 }}>
                <Label>Rent /mo (₹)</Label>
                <TextInput style={styles.input} value={rentAmount} onChangeText={setRentAmount} keyboardType="number-pad" placeholder="18000" />
              </View>
            </View>
            <Label>Tenant email (optional)</Label>
            <TextInput style={styles.input} value={tenantEmail} onChangeText={setTenantEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com" />
            <Label>Owner name (optional)</Label>
            <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName} placeholder="Flat owner name" />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Label>Start date</Label>
                <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} autoCapitalize="none" placeholder="2026-01-01" />
              </View>
              <View style={{ flex: 1 }}>
                <Label>End date</Label>
                <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} autoCapitalize="none" placeholder="2026-12-31" />
              </View>
            </View>

            <TouchableOpacity style={styles.attachBtn} onPress={attach}>
              <Ionicons name="camera-outline" size={18} color="#0B6E8F" />
              <Text style={styles.attachText}>{doc ? "Photo attached ✓ (tap to change)" : "Attach photo of agreement (optional)"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
              <Text style={styles.saveText}>{busy ? "Submitting…" : "Submit for verification"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Label({ children }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  headerBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  headerBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 14, marginBottom: 14 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#D6DEE3" },
  filterChipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  filterText: { color: "#42525B", fontWeight: "700", fontSize: 13 },
  filterTextActive: { color: "#fff" },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  flat: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  pill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: "800" },
  tenant: { color: "#42525B", marginTop: 6, fontSize: 14, fontWeight: "600" },
  dates: { color: "#6B7B85", marginTop: 3, fontSize: 13 },
  expiry: { color: "#B0620B", marginTop: 6, fontSize: 12.5, fontWeight: "700" },
  reason: { color: "#B4381F", marginTop: 6, fontSize: 12.5 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EFF5F7", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  ghostText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  approve: { backgroundColor: "#E7F6EC" },
  reject: { backgroundColor: "#FDEAE6" },
  noDoc: { color: "#8895A0", fontSize: 12, fontStyle: "italic" },
  overlay: { flex: 1, backgroundColor: "rgba(6,20,26,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "92%", overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 16 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  label: { fontSize: 12, fontWeight: "700", color: "#42525B", marginTop: 12, marginBottom: 5 },
  row: { flexDirection: "row", gap: 10 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: "#F8FAFB" },
  attachBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EAF4F8", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginTop: 16 },
  attachText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  saveBtn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
