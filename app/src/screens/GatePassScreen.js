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
  Share,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { labelsFor } from "../lib/org";
import ScreenHeader from "../components/ScreenHeader";

const TYPES = [
  { id: "guest", label: "Guest", icon: "person-outline" },
  { id: "delivery", label: "Delivery", icon: "cube-outline" },
  { id: "cab", label: "Cab", icon: "car-outline" },
  { id: "service", label: "Service", icon: "construct-outline" },
  { id: "other", label: "Other", icon: "ellipsis-horizontal" },
];
const typeMeta = (id) => TYPES.find((t) => t.id === id) || TYPES[0];

const VALIDITY = [
  { id: "2h", label: "2 hours" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "3days", label: "3 days" },
];

function windowFor(preset) {
  const now = new Date();
  const until = new Date();
  if (preset === "2h") until.setTime(now.getTime() + 2 * 3600000);
  else if (preset === "today") until.setHours(23, 59, 59, 0);
  else if (preset === "tomorrow") {
    until.setDate(until.getDate() + 1);
    until.setHours(23, 59, 59, 0);
  } else if (preset === "3days") until.setTime(now.getTime() + 3 * 86400000);
  return { validFrom: now.toISOString(), validUntil: until.toISOString() };
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

const STATUS_META = {
  active: { label: "Active", color: "#2E9E52", bg: "#E3F5E8" },
  used: { label: "Admitted", color: "#0B6E8F", bg: "#EAF4F7" },
  expired: { label: "Expired", color: "#8895A0", bg: "#EEF2F4" },
  cancelled: { label: "Cancelled", color: "#B44", bg: "#FBE9E9" },
};

export default function GatePassScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const L = labelsFor(user);
  const [passes, setPasses] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const { passes } = await api.gatePasses();
      setPasses(passes || []);
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

  const share = (p) =>
    Share.share({
      message: `Gate pass for ${p.guestName} at my ${L.org.toLowerCase()}.\nCode: ${p.code}\nValid till ${fmt(p.validUntil)}.\nShow this code at the gate.`,
    }).catch(() => {});

  const cancel = (p) =>
    Alert.alert("Cancel pass", `Cancel the gate pass for ${p.guestName}?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel pass",
        style: "destructive",
        onPress: async () => {
          try {
            await api.cancelGatePass(p.id);
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);

  const addBtn = (
    <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="qr-code"
        title="Gate passes"
        subtitle="Pre-approve guests & deliveries"
        onBack={() => navigation.goBack()}
        right={addBtn}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TouchableOpacity style={styles.cta} onPress={() => setModal(true)}>
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.ctaText}>Pre-approve a guest or delivery</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>The guard admits your guest by entering the code — you won't be disturbed.</Text>

        {passes.length === 0 && <Text style={styles.empty}>No gate passes yet.</Text>}
        {passes.map((p) => {
          const meta = typeMeta(p.type);
          const sm = STATUS_META[p.status] || STATUS_META.active;
          return (
            <View key={p.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.typeChip}>
                  <Ionicons name={meta.icon} size={13} color="#0B6E8F" />
                  <Text style={styles.typeText}>{meta.label}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: sm.bg }]}>
                  <Text style={[styles.statusText, { color: sm.color }]}>{sm.label}</Text>
                </View>
              </View>
              <Text style={styles.guest}>{p.guestName}</Text>
              {!!p.purpose && <Text style={styles.purpose}>{p.purpose}</Text>}
              <View style={styles.codeRow}>
                <View>
                  <Text style={styles.codeLabel}>Gate code</Text>
                  <Text style={styles.code}>{p.code}</Text>
                </View>
                <Text style={styles.validity}>Valid till{"\n"}{fmt(p.validUntil)}</Text>
              </View>
              {p.status === "active" && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.shareBtn} onPress={() => share(p)}>
                    <Ionicons name="share-social-outline" size={16} color="#0B6E8F" />
                    <Text style={styles.shareText}>Share code</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => cancel(p)}>
                    <Ionicons name="close-circle-outline" size={16} color="#B44" />
                    <Text style={styles.cancelActionText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <CreatePassModal visible={modal} onClose={() => setModal(false)} onDone={load} />
    </View>
  );
}

function CreatePassModal({ visible, onClose, onDone }) {
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [type, setType] = useState("guest");
  const [validity, setValidity] = useState("today");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  const pickType = (id) => {
    setType(id);
    setValidity(id === "delivery" || id === "cab" ? "2h" : "today");
  };

  const reset = () => {
    setGuestName("");
    setGuestPhone("");
    setVehicleNo("");
    setType("guest");
    setValidity("today");
    setPurpose("");
  };

  const submit = async () => {
    if (!guestName.trim()) {
      Alert.alert("Missing info", "Enter the guest / delivery name.");
      return;
    }
    setBusy(true);
    try {
      const { validFrom, validUntil } = windowFor(validity);
      await api.createGatePass({
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        vehicleNo: vehicleNo.trim() || undefined,
        type,
        purpose: purpose.trim() || undefined,
        validFrom,
        validUntil,
      });
      reset();
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
              <Ionicons name="qr-code-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>New gate pass</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Type</Label>
            <View style={styles.chipWrap}>
              {TYPES.map((t) => (
                <TouchableOpacity key={t.id} style={[styles.chip, type === t.id && styles.chipActive]} onPress={() => pickType(t.id)}>
                  <Ionicons name={t.icon} size={14} color={type === t.id ? "#fff" : "#0B6E8F"} />
                  <Text style={[styles.chipText, type === t.id && { color: "#fff" }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label>{type === "delivery" ? "Delivery / company name" : "Guest name"}</Label>
            <TextInput style={styles.input} value={guestName} onChangeText={setGuestName} placeholder={type === "delivery" ? "e.g. Amazon" : "e.g. Rahul (cousin)"} />
            <Label>Phone (optional)</Label>
            <TextInput style={styles.input} value={guestPhone} onChangeText={setGuestPhone} placeholder="Contact number" keyboardType="phone-pad" />
            <Label>Vehicle number (optional)</Label>
            <TextInput style={styles.input} value={vehicleNo} onChangeText={setVehicleNo} placeholder="MH12 AB 1234" autoCapitalize="characters" />
            <Label>Valid for</Label>
            <View style={styles.chipWrap}>
              {VALIDITY.map((v) => (
                <TouchableOpacity key={v.id} style={[styles.chip, validity === v.id && styles.chipActive]} onPress={() => setValidity(v.id)}>
                  <Text style={[styles.chipText, validity === v.id && { color: "#fff" }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label>Note (optional)</Label>
            <TextInput style={styles.input} value={purpose} onChangeText={setPurpose} placeholder="e.g. Deliver at door" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.mCancel]} onPress={onClose}>
                <Text style={styles.mCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Creating…" : "Create pass"}</Text>
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
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 14 },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  hint: { color: "#6B7B85", fontSize: 12.5, textAlign: "center", marginTop: 10, marginBottom: 8 },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 24 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EAF4F7", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { color: "#0B6E8F", fontSize: 11, fontWeight: "700" },
  statusChip: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: "800" },
  guest: { fontSize: 17, fontWeight: "800", color: "#1B2B33" },
  purpose: { color: "#6B7B85", fontSize: 13, marginTop: 2 },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 12 },
  codeLabel: { color: "#8895A0", fontSize: 11 },
  code: { color: "#0B6E8F", fontSize: 26, fontWeight: "800", letterSpacing: 4 },
  validity: { color: "#6B7B85", fontSize: 12, textAlign: "right" },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  shareBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EAF4F7", borderRadius: 10, paddingVertical: 11 },
  shareText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  cancelBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FBE9E9", borderRadius: 10, paddingVertical: 11 },
  cancelActionText: { color: "#B44", fontWeight: "700", fontSize: 13 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  chipText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  mCancel: { backgroundColor: "#EEF2F4" },
  mCancelText: { color: "#6B7B85", fontWeight: "700" },
});
