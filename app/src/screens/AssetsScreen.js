import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal } from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";
import KeyboardAvoider from "../components/KeyboardAvoider";
import DateField from "../components/DateField";

const CATS = [
  { id: "lift", label: "Lift", icon: "swap-vertical-outline" },
  { id: "pump", label: "Pump", icon: "water-outline" },
  { id: "dg", label: "DG set", icon: "flash-outline" },
  { id: "fire", label: "Fire gear", icon: "flame-outline" },
  { id: "water", label: "Water", icon: "water-outline" },
  { id: "electrical", label: "Electrical", icon: "bulb-outline" },
  { id: "other", label: "Other", icon: "cube-outline" },
];
const catMeta = (id) => CATS.find((c) => c.id === id) || CATS[6];
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function dueBadge(days) {
  if (days == null) return null;
  if (days < 0) return { text: `Overdue ${Math.abs(days)}d`, color: "#B42318", bg: "#FBE9E9" };
  if (days <= 14) return { text: `Due in ${days}d`, color: "#B4620A", bg: "#FDF1E3" };
  if (days <= 30) return { text: `${days}d left`, color: "#0B6E8F", bg: "#E7F3F7" };
  return null;
}

export default function AssetsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [assets, setAssets] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [logFor, setLogFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const { assets } = await api.assets();
      setAssets(assets || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const removeAsset = (a) =>
    Alert.alert("Remove asset", `Remove “${a.name}”?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { try { await api.deleteAsset(a.id); load(); } catch (e) { Alert.alert("Error", e.message); } } },
    ]);

  const addBtn = isAdmin ? (
    <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  ) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader icon="build" title="Assets & AMC" subtitle="Lifts, pumps, DG, fire gear & service" onBack={() => navigation.goBack()} right={addBtn} />
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {assets.length === 0 && <Text style={styles.empty}>No assets tracked yet.</Text>}
        {assets.map((a) => {
          const cm = catMeta(a.category);
          const service = dueBadge(a.serviceDueDays);
          const warranty = dueBadge(a.warrantyDays);
          const amc = dueBadge(a.amcDays);
          return (
            <View key={a.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.catIcon}><Ionicons name={cm.icon} size={18} color="#0B6E8F" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{a.name}</Text>
                  <Text style={styles.sub}>{cm.label}{a.location ? ` · ${a.location}` : ""}</Text>
                </View>
                {isAdmin && (
                  <TouchableOpacity onPress={() => removeAsset(a)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color="#B44" />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.badgeRow}>
                {service && <Badge label={`Service: ${service.text}`} {...service} />}
                {warranty && <Badge label={`Warranty: ${warranty.text}`} {...warranty} />}
                {amc && <Badge label={`AMC: ${amc.text}`} {...amc} />}
              </View>
              <View style={styles.metaGrid}>
                <Meta label="Warranty till" value={fmtDate(a.warrantyUntil)} />
                <Meta label="AMC till" value={fmtDate(a.amcUntil)} />
                <Meta label="Last service" value={fmtDate(a.lastServicedAt)} />
                <Meta label="Next service" value={fmtDate(a.nextServiceAt)} />
              </View>
              {!!a.vendorName && <Text style={styles.vendor}>Vendor: {a.vendorName}{a.vendorPhone ? ` · ${a.vendorPhone}` : ""}</Text>}
              {isAdmin && (
                <TouchableOpacity style={styles.logBtn} onPress={() => setLogFor(a)}>
                  <Ionicons name="construct-outline" size={15} color="#0B6E8F" />
                  <Text style={styles.logBtnText}>Log service / repair</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
      <AssetModal visible={modal} onClose={() => setModal(false)} onDone={load} />
      <LogModal asset={logFor} onClose={() => setLogFor(null)} onDone={load} />
    </View>
  );
}

const Badge = ({ label, color, bg }) => (
  <View style={[styles.badge, { backgroundColor: bg }]}><Text style={[styles.badgeText, { color }]}>{label}</Text></View>
);
const Meta = ({ label, value }) => (
  <View style={styles.meta}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View>
);
const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

function AssetModal({ visible, onClose, onDone }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("lift");
  const [location, setLocation] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [warrantyUntil, setWarrantyUntil] = useState("");
  const [amcUntil, setAmcUntil] = useState("");
  const [serviceEveryDays, setServiceEveryDays] = useState("");
  const [lastServicedAt, setLastServicedAt] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setName(""); setCategory("lift"); setLocation(""); setVendorName(""); setVendorPhone(""); setWarrantyUntil(""); setAmcUntil(""); setServiceEveryDays(""); setLastServicedAt(""); };

  const submit = async () => {
    if (!name.trim()) return Alert.alert("Missing info", "Enter an asset name.");
    setBusy(true);
    try {
      await api.createAsset({ name: name.trim(), category, location: location.trim() || undefined, vendorName: vendorName.trim() || undefined, vendorPhone: vendorPhone.trim() || undefined, warrantyUntil: warrantyUntil || undefined, amcUntil: amcUntil || undefined, serviceEveryDays: serviceEveryDays || undefined, lastServicedAt: lastServicedAt || undefined });
      reset(); onClose(); onDone();
    } catch (e) { Alert.alert("Error", e.message); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Add asset</Text></View>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Name</Label>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Lift — B Wing" />
            <Label>Category</Label>
            <View style={styles.catPick}>
              {CATS.map((c) => (
                <TouchableOpacity key={c.id} style={[styles.catOpt, category === c.id && styles.catOptActive]} onPress={() => setCategory(c.id)}>
                  <Ionicons name={c.icon} size={14} color={category === c.id ? "#fff" : "#0B6E8F"} />
                  <Text style={[styles.catOptText, category === c.id && { color: "#fff" }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label>Location (optional)</Label>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Basement / B Wing" />
            <Label>Vendor name (optional)</Label>
            <TextInput style={styles.input} value={vendorName} onChangeText={setVendorName} placeholder="Service company" />
            <Label>Vendor phone (optional)</Label>
            <TextInput style={styles.input} value={vendorPhone} onChangeText={setVendorPhone} placeholder="Contact number" keyboardType="phone-pad" />
            <Label>Warranty till (optional)</Label>
            <DateField value={warrantyUntil} onChange={setWarrantyUntil} placeholder="Select date" />
            <Label>AMC till (optional)</Label>
            <DateField value={amcUntil} onChange={setAmcUntil} placeholder="Select date" />
            <Label>Service every (days, optional)</Label>
            <TextInput style={styles.input} value={serviceEveryDays} onChangeText={setServiceEveryDays} placeholder="e.g. 90" keyboardType="numeric" />
            <Label>Last serviced (optional)</Label>
            <DateField value={lastServicedAt} onChange={setLastServicedAt} placeholder="Select date" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.mCancel]} onPress={onClose}><Text style={styles.mCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}><Text style={styles.mBtnText}>{busy ? "Saving…" : "Add asset"}</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

function LogModal({ asset, onClose, onDone }) {
  const [kind, setKind] = useState("service");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.addAssetLog(asset.id, { kind, cost: cost || undefined, note: note.trim() || undefined });
      setKind("service"); setCost(""); setNote(""); onClose(); onDone();
    } catch (e) { Alert.alert("Error", e.message); } finally { setBusy(false); }
  };

  return (
    <Modal visible={!!asset} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Log for {asset?.name}</Text></View>
          <View style={styles.modalBody}>
            <Label>Type</Label>
            <View style={styles.catPick}>
              {["service", "repair", "inspection", "note"].map((k) => (
                <TouchableOpacity key={k} style={[styles.catOpt, kind === k && styles.catOptActive]} onPress={() => setKind(k)}>
                  <Text style={[styles.catOptText, kind === k && { color: "#fff" }]}>{k[0].toUpperCase() + k.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label>Cost (Rs., optional)</Label>
            <TextInput style={styles.input} value={cost} onChangeText={setCost} placeholder="0" keyboardType="numeric" />
            <Label>Note (optional)</Label>
            <TextInput style={[styles.input, styles.multiline]} value={note} onChangeText={setNote} placeholder="What was done…" multiline />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.mCancel]} onPress={onClose}><Text style={styles.mCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}><Text style={styles.mBtnText}>{busy ? "Saving…" : "Save log"}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 28 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  catIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#E7F3F7", alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  sub: { color: "#6B7B85", fontSize: 12.5, marginTop: 2 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontWeight: "800", fontSize: 11 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  meta: { width: "50%", marginBottom: 8 },
  metaLabel: { color: "#9AA7AF", fontSize: 11 },
  metaValue: { color: "#1B2B33", fontSize: 13, fontWeight: "600", marginTop: 1 },
  vendor: { color: "#6B7B85", fontSize: 12.5, marginTop: 2 },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 10, backgroundColor: "#E7F3F7", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  logBtnText: { color: "#0B6E8F", fontWeight: "700", fontSize: 12.5 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { backgroundColor: "#0B6E8F", paddingHorizontal: 18, paddingVertical: 16 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  modalBody: { padding: 20, paddingTop: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  catPick: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catOpt: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  catOptActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  catOptText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  mBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "700" },
  mCancel: { backgroundColor: "#EEF2F4" },
  mCancelText: { color: "#6B7B85", fontWeight: "700" },
});
