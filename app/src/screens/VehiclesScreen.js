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
  Image,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { downloadReceipt } from "../lib/receipt";
import ScreenHeader from "../components/ScreenHeader";

const TYPES = [
  { id: "car", label: "Car", icon: "car-sport-outline" },
  { id: "bike", label: "Bike / Scooter", icon: "bicycle-outline" },
  { id: "other", label: "Other", icon: "cube-outline" },
];
const typeMeta = (id) => TYPES.find((t) => t.id === id) || TYPES[0];

const qrUrlFor = (code) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(code)}`;

function buildVehiclePassHtml(v, societyName) {
  const t = typeMeta(v.type);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#1B2B33; margin:0; padding:24px; background:#fff; }
  .card { max-width:420px; margin:0 auto; border:2px solid #0B6E8F; border-radius:18px; overflow:hidden; text-align:center; }
  .head { background:#0B6E8F; color:#fff; padding:18px 20px; }
  .society { font-size:18px; font-weight:800; }
  .sub { color:#CDE9F2; font-size:12px; margin-top:2px; }
  .body { padding:22px 20px; }
  .qr { width:240px; height:240px; }
  .plate { font-size:28px; font-weight:800; letter-spacing:3px; margin-top:12px; }
  .meta { color:#6B7B85; font-size:13px; margin-top:4px; }
  .foot { color:#8895A0; font-size:11px; padding:0 20px 18px; }
</style></head>
<body>
  <div class="card">
    <div class="head">
      <div class="society">${societyName}</div>
      <div class="sub">Vehicle Gate Pass</div>
    </div>
    <div class="body">
      <img class="qr" src="${qrUrlFor(v.code)}" />
      <div class="plate">${v.plate}</div>
      <div class="meta">${t.label}${v.flatNo ? " · Flat " + v.flatNo : ""}${v.ownerName ? " · " + v.ownerName : ""}</div>
    </div>
    <div class="foot">Stick this QR on the windshield. The gate scanner reads it to admit your vehicle automatically.</div>
  </div>
</body></html>`;
}

export default function VehiclesScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const platinum = (user?.societyTier || "platinum") === "platinum";

  const [vehicles, setVehicles] = useState([]);
  const [flats, setFlats] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editor, setEditor] = useState(null); // { vehicle } | { new:true }
  const [qrView, setQrView] = useState(null); // vehicle

  const load = useCallback(async () => {
    try {
      const { vehicles } = await api.vehicles();
      setVehicles(vehicles || []);
      if (isAdmin) {
        const { flats } = await api.flats();
        setFlats(flats || []);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, [isAdmin]);

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

  const printPass = async (v) => {
    try {
      const societyName = user?.societyName || "GateMate";
      await downloadReceipt(buildVehiclePassHtml(v, societyName), `GatePass-${v.plate}`);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const toggleActive = async (v) => {
    try {
      await api.updateVehicle(v.id, { active: !v.active });
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const rotate = (v) =>
    Alert.alert("Regenerate QR", "This revokes the old QR (the printed sticker stops working) and issues a fresh one. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Regenerate",
        style: "destructive",
        onPress: async () => {
          try {
            const { vehicle } = await api.rotateVehicleCode(v.id);
            load();
            setQrView(vehicle);
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);

  const remove = (v) =>
    Alert.alert("Remove vehicle", `Remove ${v.plate}? Its QR will stop working immediately.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteVehicle(v.id);
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);

  const addBtn = (
    <TouchableOpacity onPress={() => setEditor({ new: true })} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="car-sport"
        title="Vehicle passes"
        subtitle="Register vehicles & print gate QR"
        onBack={() => navigation.goBack()}
        right={platinum ? addBtn : null}
      />

      {!platinum ? (
        <View style={styles.lockWrap}>
          <Ionicons name="lock-closed" size={40} color="#9AA7AF" />
          <Text style={styles.lockTitle}>A Platinum feature</Text>
          <Text style={styles.lockText}>
            Automated vehicle gate (QR / RFID / number-plate) is available on the Platinum plan. Ask your GateMate owner to upgrade.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <TouchableOpacity style={styles.cta} onPress={() => setEditor({ new: true })}>
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.ctaText}>Add a vehicle</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Each vehicle gets a printable QR. Stick it on the windshield — the gate scanner reads it and opens the barrier automatically.
          </Text>

          {vehicles.length === 0 && <Text style={styles.empty}>No vehicles registered yet.</Text>}
          {vehicles.map((v) => {
            const t = typeMeta(v.type);
            return (
              <View key={v.id} style={[styles.card, !v.active && styles.cardInactive]}>
                <View style={styles.cardTop}>
                  <View style={styles.typeChip}>
                    <Ionicons name={t.icon} size={13} color="#0B6E8F" />
                    <Text style={styles.typeText}>{t.label}</Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: v.active ? "#E3F5E8" : "#EEF2F4" }]}>
                    <Text style={[styles.statusText, { color: v.active ? "#2E9E52" : "#8895A0" }]}>
                      {v.active ? "Active" : "Disabled"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.plate}>{v.plate}</Text>
                <Text style={styles.sub}>
                  {v.flatNo ? `Flat ${v.flatNo}` : "No flat"}
                  {v.ownerName ? ` · ${v.ownerName}` : ""}
                </Text>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => setQrView(v)}>
                    <Ionicons name="qr-code-outline" size={16} color="#fff" />
                    <Text style={styles.primaryText}>Show QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditor({ vehicle: v })}>
                    <Ionicons name="create-outline" size={16} color="#0B6E8F" />
                    <Text style={styles.ghostText}>Edit</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.subActions}>
                  <TouchableOpacity onPress={() => toggleActive(v)} style={styles.subAction}>
                    <Ionicons name={v.active ? "pause-circle-outline" : "play-circle-outline"} size={15} color="#6B7B85" />
                    <Text style={styles.subActionText}>{v.active ? "Disable" : "Enable"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => rotate(v)} style={styles.subAction}>
                    <Ionicons name="refresh-outline" size={15} color="#6B7B85" />
                    <Text style={styles.subActionText}>New QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(v)} style={styles.subAction}>
                    <Ionicons name="trash-outline" size={15} color="#B44" />
                    <Text style={[styles.subActionText, { color: "#B44" }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {isAdmin && (
            <TouchableOpacity style={styles.devicesLink} onPress={() => navigation.navigate("GateDevices")}>
              <Ionicons name="hardware-chip-outline" size={18} color="#0B6E8F" />
              <Text style={styles.devicesLinkText}>Manage gate scanners</Text>
              <Ionicons name="chevron-forward" size={16} color="#9AA7AF" />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <VehicleEditorModal
        state={editor}
        flats={flats}
        isAdmin={isAdmin}
        onClose={() => setEditor(null)}
        onDone={load}
      />

      <Modal visible={!!qrView} transparent animationType="fade" onRequestClose={() => setQrView(null)}>
        <View style={styles.overlay}>
          <View style={styles.qrCard}>
            <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.qrHeader}>
              <Text style={styles.qrHeaderText}>{qrView?.plate}</Text>
              <TouchableOpacity onPress={() => setQrView(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </LinearGradient>
            <View style={styles.qrBody}>
              {qrView && <Image source={{ uri: qrUrlFor(qrView.code) }} style={styles.qrImg} />}
              <Text style={styles.qrMeta}>
                {qrView ? typeMeta(qrView.type).label : ""}
                {qrView?.flatNo ? ` · Flat ${qrView.flatNo}` : ""}
              </Text>
              <TouchableOpacity style={styles.printBtn} onPress={() => qrView && printPass(qrView)}>
                <Ionicons name="print-outline" size={18} color="#fff" />
                <Text style={styles.printText}>Print / Save PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function VehicleEditorModal({ state, flats, isAdmin, onClose, onDone }) {
  const editing = state && !state.new ? state.vehicle : null;
  const [type, setType] = useState("car");
  const [plate, setPlate] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [flatId, setFlatId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [initFor, setInitFor] = useState(null);

  // Sync form when the modal opens for a (different) vehicle.
  const key = state ? (editing ? editing.id : "new") : null;
  if (state && key !== initFor) {
    setInitFor(key);
    setType(editing?.type || "car");
    setPlate(editing?.plate || "");
    setOwnerName(editing?.ownerName || "");
    setFlatId(editing?.flatId || null);
  }

  const submit = async () => {
    if (!plate.trim()) {
      Alert.alert("Missing info", "Enter the vehicle number.");
      return;
    }
    setBusy(true);
    try {
      const payload = { type, plate: plate.trim(), ownerName: ownerName.trim() || undefined };
      if (isAdmin) payload.flatId = flatId || undefined;
      if (editing) await api.updateVehicle(editing.id, payload);
      else await api.createVehicle(payload);
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="car-sport-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{editing ? "Edit vehicle" : "Add vehicle"}</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Type</Label>
            <View style={styles.chipWrap}>
              {TYPES.map((t) => (
                <TouchableOpacity key={t.id} style={[styles.chip, type === t.id && styles.chipActive]} onPress={() => setType(t.id)}>
                  <Ionicons name={t.icon} size={14} color={type === t.id ? "#fff" : "#0B6E8F"} />
                  <Text style={[styles.chipText, type === t.id && { color: "#fff" }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label>Vehicle number</Label>
            <TextInput style={styles.input} value={plate} onChangeText={setPlate} placeholder="MH12 AB 1234" autoCapitalize="characters" />
            <Label>Owner name (optional)</Label>
            <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName} placeholder="e.g. Rahul Sharma" />
            {isAdmin && (
              <>
                <Label>Flat</Label>
                <View style={styles.chipWrap}>
                  {flats.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.chip, flatId === f.id && styles.chipActive]}
                      onPress={() => setFlatId(f.id)}
                    >
                      <Text style={[styles.chipText, flatId === f.id && { color: "#fff" }]}>
                        {f.block ? `${f.block}-` : ""}{f.flatNo}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.mCancel]} onPress={onClose}>
                <Text style={styles.mCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Saving…" : editing ? "Save" : "Add"}</Text>
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
  lockWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  lockTitle: { fontSize: 18, fontWeight: "800", color: "#1B2B33" },
  lockText: { color: "#6B7B85", fontSize: 14, textAlign: "center", lineHeight: 20 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 12 },
  cardInactive: { opacity: 0.7 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EAF4F7", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { color: "#0B6E8F", fontSize: 11, fontWeight: "700" },
  statusChip: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: "800" },
  plate: { fontSize: 22, fontWeight: "800", color: "#1B2B33", letterSpacing: 2 },
  sub: { color: "#6B7B85", fontSize: 13, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 11 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ghostBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EAF4F7", borderRadius: 10, paddingVertical: 11 },
  ghostText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  subActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, borderTopWidth: 1, borderTopColor: "#EEF2F4", paddingTop: 10 },
  subAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  subActionText: { color: "#6B7B85", fontSize: 12.5, fontWeight: "600" },
  devicesLink: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 12, padding: 14, marginTop: 16 },
  devicesLinkText: { flex: 1, color: "#0B6E8F", fontWeight: "700", fontSize: 14 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  qrCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  qrHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 16 },
  qrHeaderText: { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: 2 },
  qrBody: { alignItems: "center", padding: 24 },
  qrImg: { width: 240, height: 240 },
  qrMeta: { color: "#6B7B85", fontSize: 14, marginTop: 12 },
  printBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 13, paddingHorizontal: 22, marginTop: 18 },
  printText: { color: "#fff", fontWeight: "800", fontSize: 15 },
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
