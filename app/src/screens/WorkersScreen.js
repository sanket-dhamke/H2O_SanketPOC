import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import ScreenHeader from "../components/ScreenHeader";
import KeyboardAvoider from "../components/KeyboardAvoider";

export const WORKER_CATS = [
  { id: "helpers", label: "Daily help", icon: "people-circle", color: "#0B6E8F" },
  { id: "trades", label: "Home services", icon: "construct", color: "#7A5AF8" },
  { id: "medical", label: "Medical", icon: "medkit", color: "#B42318" },
  { id: "utilities", label: "Utilities", icon: "flash", color: "#C2571A" },
  { id: "lifestyle", label: "Lifestyle", icon: "sparkles", color: "#2E9E52" },
];
export const workerCat = (id) => WORKER_CATS.find((c) => c.id === id) || WORKER_CATS[0];

const SUBTYPES = {
  helpers: ["Maid", "Cook", "Driver", "Nanny", "Car cleaner", "Gardener"],
  trades: ["Electrician", "Plumber", "Carpenter", "AC repair", "Painter", "Pest control"],
  medical: ["Nurse", "Physio", "Doctor on call", "Lab sample"],
  utilities: ["Gas delivery", "Water tanker", "Cable/Internet"],
  lifestyle: ["Tiffin / food", "Tutor", "Salon at home", "Laundry"],
};

export function Stars({ value = 0, size = 14 }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={value >= n ? "star" : value >= n - 0.5 ? "star-half" : "star-outline"} size={size} color="#F0A500" />
      ))}
    </View>
  );
}

export default function WorkersScreen() {
  const navigation = useNavigation();
  const [workers, setWorkers] = useState([]);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.workers({ query: query.trim() || undefined, category: cat === "all" ? undefined : cat });
      setWorkers(r.workers || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, [query, cat]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [query, cat, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const addBtn = (
    <TouchableOpacity onPress={() => setAdding(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="ribbon"
        title="Trusted helpers"
        subtitle="Ratings that follow the worker across societies"
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
        right={addBtn}
      />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#8895A0" />
        <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search maid, electrician, tiffin…" />
      </View>

      <View style={styles.catBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catBarContent}>
          <Chip label="All" active={cat === "all"} onPress={() => setCat("all")} />
          {WORKER_CATS.map((c) => (
            <Chip key={c.id} label={c.label} icon={c.icon} active={cat === c.id} onPress={() => setCat(c.id)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={workers}
        keyExtractor={(w) => w.id}
        contentContainerStyle={{ padding: 16, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="ribbon-outline" size={30} color="#B7C2C9" />
            <Text style={styles.emptyText}>No rated helpers yet. Tap + to add one — their rating will then follow them everywhere.</Text>
          </View>
        }
        renderItem={({ item: w }) => {
          const meta = workerCat(w.category);
          return (
            <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate("WorkerPassport", { id: w.id })}>
              <View style={[styles.avatar, { backgroundColor: meta.color + "1A" }]}>
                <Ionicons name={meta.icon} size={20} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{w.name}</Text>
                <Text style={styles.sub}>{w.subtype || meta.label}</Text>
                <View style={styles.ratingRow}>
                  <Stars value={w.rating} />
                  <Text style={styles.ratingText}>
                    {w.reviewCount ? `${w.rating.toFixed(1)} · ${w.reviewCount} review${w.reviewCount === 1 ? "" : "s"}` : "Not rated yet"}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#B7C2C9" />
            </TouchableOpacity>
          );
        }}
      />

      <RegisterWorkerModal
        visible={adding}
        onClose={() => setAdding(false)}
        onDone={(w) => {
          setAdding(false);
          if (w?.id) navigation.navigate("WorkerPassport", { id: w.id });
        }}
      />
    </View>
  );
}

function Chip({ label, icon, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      {icon && <Ionicons name={icon} size={13} color={active ? "#fff" : "#0B6E8F"} />}
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RegisterWorkerModal({ visible, onClose, onDone }) {
  const [category, setCategory] = useState("helpers");
  const [subtype, setSubtype] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [idProof, setIdProof] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory("helpers");
      setSubtype("");
      setName("");
      setPhone("");
      setIdProof("");
    }
  }, [visible]);

  const submit = async () => {
    if (!name.trim()) return Alert.alert("Missing info", "Enter the worker's name.");
    if (phone.replace(/\D/g, "").length < 10) return Alert.alert("Phone needed", "A 10-digit phone number is the worker's portable identity.");
    setBusy(true);
    try {
      const r = await api.registerWorker({ name: name.trim(), phone, category, subtype: subtype.trim() || undefined, idProof: idProof.trim() || undefined });
      if (r.existed) {
        Alert.alert("Already on GateMate", `${r.worker.name} already has a Trust Passport — opening it so you can add your rating.`);
      }
      onDone(r.worker);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="ribbon-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Add a helper</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Category</Label>
            <View style={styles.pickRow}>
              {WORKER_CATS.map((c) => (
                <TouchableOpacity key={c.id} style={[styles.pick, category === c.id && styles.pickActive]} onPress={() => setCategory(c.id)}>
                  <Ionicons name={c.icon} size={14} color={category === c.id ? "#fff" : "#0B6E8F"} />
                  <Text style={[styles.pickText, category === c.id && { color: "#fff" }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label>Type</Label>
            <View style={styles.suggestRow}>
              {(SUBTYPES[category] || []).map((s) => (
                <TouchableOpacity key={s} style={styles.suggestChip} onPress={() => setSubtype(s)}>
                  <Text style={styles.suggestChipText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} value={subtype} onChangeText={setSubtype} placeholder="e.g. Maid" />
            <Label>Name *</Label>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Sunita" />
            <Label>Phone * (portable identity)</Label>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="10-digit mobile" keyboardType="phone-pad" />
            <Label>ID note (optional)</Label>
            <TextInput style={styles.input} value={idProof} onChangeText={setIdProof} placeholder="e.g. Aadhaar verified, police-verified" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.mBtnText}>{busy ? "Saving…" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", marginHorizontal: 16, marginTop: 12, borderRadius: 12, paddingHorizontal: 14 },
  search: { flex: 1, paddingVertical: 12, fontSize: 15 },
  catBar: { marginTop: 12, height: 42 },
  catBarContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 14, height: 34 },
  chipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  chipText: { color: "#0B6E8F", fontSize: 12.5, fontWeight: "700" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "800", color: "#1B2B33" },
  sub: { color: "#6B7B85", fontSize: 12.5, marginTop: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  ratingText: { color: "#8895A0", fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10, paddingHorizontal: 30 },
  emptyText: { color: "#8895A0", fontSize: 14, fontWeight: "600", textAlign: "center", lineHeight: 20 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 18 },
  label: { fontSize: 13, fontWeight: "700", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  pickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pick: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  pickActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  pickText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  suggestChip: { backgroundColor: "#EAF4F7", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  suggestChipText: { color: "#0B6E8F", fontSize: 11.5, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  mBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "800" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
