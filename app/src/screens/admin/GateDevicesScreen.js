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
import TextInput from "../../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

export default function GateDevicesScreen() {
  const navigation = useNavigation();
  const [devices, setDevices] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      const { devices } = await api.gateDevices();
      setDevices(devices || []);
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

  const toggle = async (d) => {
    try {
      await api.updateGateDevice(d.id, { active: !d.active });
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const remove = (d) =>
    Alert.alert("Remove scanner", `Remove “${d.name}”? Its device key stops working immediately.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteGateDevice(d.id);
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
        icon="hardware-chip"
        title="Gate scanners"
        subtitle="Connect entry-lane devices"
        onBack={() => navigation.goBack()}
        right={addBtn}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color="#0B6E8F" />
          <Text style={styles.infoText}>
            Add a scanner for each entry lane, then configure the device (or your installer) with its device key and the verify URL below. The
            scanner posts each scanned QR to GateMate and opens the barrier when we return “open”.
          </Text>
        </View>

        <TouchableOpacity style={styles.cta} onPress={() => setModal(true)}>
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.ctaText}>Add a scanner</Text>
        </TouchableOpacity>

        {devices.length === 0 && <Text style={styles.empty}>No scanners connected yet.</Text>}
        {devices.map((d) => (
          <View key={d.id} style={[styles.card, !d.active && styles.cardInactive]}>
            <View style={styles.cardTop}>
              <Text style={styles.name}>{d.name}</Text>
              <View style={[styles.statusChip, { backgroundColor: d.active ? "#E3F5E8" : "#EEF2F4" }]}>
                <Text style={[styles.statusText, { color: d.active ? "#2E9E52" : "#8895A0" }]}>{d.active ? "Active" : "Disabled"}</Text>
              </View>
            </View>
            {!!d.location && <Text style={styles.sub}>{d.location}</Text>}
            <Text style={styles.seen}>Last seen: {fmt(d.lastSeenAt)}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setDetail(d)}>
                <Ionicons name="key-outline" size={16} color="#fff" />
                <Text style={styles.primaryText}>Setup details</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => toggle(d)}>
                <Ionicons name={d.active ? "pause-outline" : "play-outline"} size={16} color="#0B6E8F" />
                <Text style={styles.ghostText}>{d.active ? "Disable" : "Enable"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.trashBtn} onPress={() => remove(d)}>
                <Ionicons name="trash-outline" size={16} color="#B44" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <AddDeviceModal visible={modal} onClose={() => setModal(false)} onDone={load} />
      <DeviceDetailModal device={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

function Row({ label, value }) {
  const shareValue = () => Share.share({ message: `${label}: ${value || "-"}` }).catch(() => {});
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <View style={styles.kvValueRow}>
        <Text style={styles.kvValue} selectable numberOfLines={2}>
          {value || "-"}
        </Text>
        <TouchableOpacity onPress={shareValue} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="share-outline" size={16} color="#0B6E8F" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DeviceDetailModal({ device, onClose }) {
  if (!device) return null;
  const shareAll = () =>
    Share.share({
      message:
        `GateMate scanner setup — ${device.name}\n\n` +
        `Device key: ${device.deviceKey}\n` +
        `Verify URL (POST): ${device.verifyUrl}\n` +
        `Whitelist URL (GET): ${device.whitelistUrl}\n\n` +
        `Verify body: { "deviceKey": "…", "code": "<scanned QR>", "direction": "in" }\n` +
        `Response: { "open": true|false, ... } → open the barrier when open=true.`,
    }).catch(() => {});
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="key-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{device.name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={styles.modalBody}>
            <Text style={styles.detailHint}>
              Give these to your gate-hardware installer. Keep the device key secret — anyone with it can query your whitelist.
            </Text>
            <Row label="Device key" value={device.deviceKey} />
            <Row label="Verify URL (POST)" value={device.verifyUrl} />
            <Row label="Whitelist URL (GET)" value={device.whitelistUrl} />
            <View style={styles.codeBlock}>
              <Text style={styles.codeText}>{`POST verify body:
{
  "deviceKey": "${device.deviceKey.slice(0, 10)}…",
  "code": "<scanned QR text>",
  "direction": "in"
}

Response → open the barrier when:
{ "open": true }`}</Text>
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={shareAll}>
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={styles.shareText}>Share setup details</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AddDeviceModal({ visible, onClose, onDone }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setLocation("");
  };

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert("Missing info", "Give the scanner a name (e.g. Main Gate — Entry).");
      return;
    }
    setBusy(true);
    try {
      await api.createGateDevice({ name: name.trim(), location: location.trim() || undefined });
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
              <Ionicons name="hardware-chip-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Add scanner</Text>
          </LinearGradient>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Name</Label>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Main Gate — Entry" />
            <Label>Location (optional)</Label>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Lane 1, near guard cabin" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.mCancel]} onPress={onClose}>
                <Text style={styles.mCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Adding…" : "Add scanner"}</Text>
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
  infoBox: { flexDirection: "row", gap: 8, backgroundColor: "#EAF4F7", borderRadius: 12, padding: 12, marginBottom: 12 },
  infoText: { flex: 1, color: "#3A5460", fontSize: 12.5, lineHeight: 18 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 14 },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 24 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 12 },
  cardInactive: { opacity: 0.7 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { fontSize: 16, fontWeight: "800", color: "#1B2B33", flex: 1 },
  statusChip: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: "800" },
  sub: { color: "#6B7B85", fontSize: 13, marginTop: 2 },
  seen: { color: "#8895A0", fontSize: 12, marginTop: 4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12, alignItems: "center" },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 11 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ghostBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EAF4F7", borderRadius: 10, paddingVertical: 11 },
  ghostText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  trashBtn: { width: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#FBE9E9", borderRadius: 10, paddingVertical: 11 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  detailHint: { color: "#6B7B85", fontSize: 12.5, lineHeight: 18, marginBottom: 8 },
  kvRow: { marginTop: 12 },
  kvLabel: { color: "#8895A0", fontSize: 12, marginBottom: 3 },
  kvValueRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 10 },
  kvValue: { flex: 1, color: "#1B2B33", fontSize: 13, fontWeight: "600" },
  codeBlock: { backgroundColor: "#0E2A33", borderRadius: 10, padding: 12, marginTop: 14 },
  codeText: { color: "#CDE9F2", fontSize: 12, fontFamily: "monospace" },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 13, marginTop: 16 },
  shareText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  mCancel: { backgroundColor: "#EEF2F4" },
  mCancelText: { color: "#6B7B85", fontWeight: "700" },
});
