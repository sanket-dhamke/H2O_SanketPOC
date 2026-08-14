import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Alert,
  RefreshControl,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";
import KeyboardAvoider from "../components/KeyboardAvoider";
import FlatPicker from "../components/FlatPicker";

const qrUrlFor = (code) => `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(code)}`;
const UPDATE_TYPES = [
  { id: "meal", label: "Meal", icon: "restaurant", color: "#C2571A" },
  { id: "nap", label: "Nap", icon: "moon", color: "#6D3BD1" },
  { id: "mood", label: "Mood", icon: "happy", color: "#C99000" },
  { id: "activity", label: "Activity", icon: "color-palette", color: "#0B6E8F" },
  { id: "health", label: "Health", icon: "medkit", color: "#B42318" },
  { id: "note", label: "Note", icon: "chatbox-ellipses", color: "#2E9E52" },
];
const typeMeta = (id) => UPDATE_TYPES.find((t) => t.id === id) || UPDATE_TYPES[5];
const RELATIONS = ["Parent", "Grandparent", "Driver", "Relative", "Other"];

export default function ChildScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [flats, setFlats] = useState([]);
  const [flatId, setFlatId] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [auths, setAuths] = useState([]);
  const [events, setEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [qr, setQr] = useState(null);
  const [addingPickup, setAddingPickup] = useState(false);
  const [postingUpdate, setPostingUpdate] = useState(false);

  useEffect(() => {
    if (isAdmin) api.adminListFlats().then((r) => setFlats(r.flats || [])).catch(() => {});
  }, [isAdmin]);

  const load = useCallback(async () => {
    if (isAdmin && !flatId) return;
    try {
      const [u, a, e] = await Promise.all([
        api.childUpdates(isAdmin ? flatId : undefined),
        api.pickupAuthorizations(isAdmin ? flatId : undefined),
        api.pickupEvents(isAdmin ? flatId : undefined),
      ]);
      setUpdates(u.updates || []);
      setAuths(a.authorizations || []);
      setEvents(e.events || []);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  }, [isAdmin, flatId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const removePickup = (a) => {
    Alert.alert("Remove pickup person", `Remove ${a.name}? Their pass will stop working.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deletePickupAuthorization(a.id);
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const needsPick = isAdmin && !flatId;

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="happy"
        title={isAdmin ? "Pickups & updates" : "My child"}
        subtitle={isAdmin ? "Post updates & manage pickups" : "Today at school & pickup passes"}
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {isAdmin && (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.pickLabel}>Student</Text>
            <FlatPicker flats={flats} value={flatId} onChange={setFlatId} placeholder="Select a student" />
          </View>
        )}

        {needsPick ? (
          <View style={styles.empty}>
            <Ionicons name="school-outline" size={30} color="#B7C2C9" />
            <Text style={styles.emptyText}>Pick a student to view their updates and pickup passes.</Text>
          </View>
        ) : (
          <>
            {/* Updates */}
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Today at school</Text>
              {isAdmin && (
                <TouchableOpacity onPress={() => setPostingUpdate(true)}>
                  <Text style={styles.link}>+ Post update</Text>
                </TouchableOpacity>
              )}
            </View>
            {updates.length === 0 ? (
              <Text style={styles.muted}>No updates yet.</Text>
            ) : (
              updates.map((u) => {
                const m = typeMeta(u.type);
                return (
                  <View key={u.id} style={styles.updateRow}>
                    <View style={[styles.updateIcon, { backgroundColor: m.color + "1A" }]}>
                      <Ionicons name={m.icon} size={16} color={m.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.updateText}>{u.text}</Text>
                      <Text style={styles.updateMeta}>
                        {m.label}
                        {u.mood ? ` · ${u.mood}` : ""} · {new Date(u.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {u.byName ? ` · ${u.byName}` : ""}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}

            {/* Pickup persons */}
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Authorized to pick up</Text>
              <TouchableOpacity onPress={() => setAddingPickup(true)}>
                <Text style={styles.link}>+ Add person</Text>
              </TouchableOpacity>
            </View>
            {auths.length === 0 ? (
              <Text style={styles.muted}>No one added yet. Add a parent, grandparent or driver — each gets a QR pass the guard scans.</Text>
            ) : (
              auths.map((a) => (
                <View key={a.id} style={styles.pickCard}>
                  <View style={styles.pickAvatar}>
                    {a.photoUrl ? <Image source={{ uri: a.photoUrl }} style={styles.pickAvatarImg} /> : <Ionicons name="person" size={18} color="#0B6E8F" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>{a.name}</Text>
                    <Text style={styles.pickSub}>{[a.relation, a.phone].filter(Boolean).join(" · ") || "Authorized"}</Text>
                  </View>
                  <TouchableOpacity style={styles.pickBtn} onPress={() => setQr(a)}>
                    <Ionicons name="qr-code" size={18} color="#6D3BD1" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.pickBtn} onPress={() => removePickup(a)}>
                    <Ionicons name="trash-outline" size={18} color="#B42318" />
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Pickup history */}
            {events.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Pickup / drop log</Text>
                <View style={styles.card}>
                  {events.slice(0, 10).map((e, i) => (
                    <View key={e.id} style={[styles.eventRow, i > 0 && styles.divider]}>
                      <Ionicons name={e.kind === "drop" ? "log-in-outline" : "log-out-outline"} size={16} color={e.kind === "drop" ? "#2E9E52" : "#C2571A"} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eventName}>{e.personName}{e.relation ? ` (${e.relation})` : ""}</Text>
                        <Text style={styles.eventMeta}>{e.kind === "drop" ? "Dropped" : "Picked up"} · {new Date(e.at).toLocaleString()}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* QR modal */}
      <Modal visible={!!qr} transparent animationType="fade" onRequestClose={() => setQr(null)}>
        <View style={styles.overlay}>
          <View style={styles.qrCard}>
            <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.qrHeader}>
              <Text style={styles.qrHeaderText}>{qr?.name}</Text>
              <TouchableOpacity onPress={() => setQr(null)}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
            </LinearGradient>
            <View style={styles.qrBody}>
              {qr && <Image source={{ uri: qrUrlFor(qr.code) }} style={styles.qrImg} />}
              <Text style={styles.qrHint}>Show this at the gate. The guard scans it to confirm an authorized pickup — every pickup is logged and you're notified.</Text>
            </View>
          </View>
        </View>
      </Modal>

      <PickupModal visible={addingPickup} onClose={() => setAddingPickup(false)} flatId={isAdmin ? flatId : undefined} onDone={() => { setAddingPickup(false); load(); }} />
      <PostUpdateModal visible={postingUpdate} onClose={() => setPostingUpdate(false)} flatId={flatId} onDone={() => { setPostingUpdate(false); load(); }} />
    </View>
  );
}

function PickupModal({ visible, onClose, flatId, onDone }) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("Parent");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setName(""); setRelation("Parent"); setPhone(""); } }, [visible]);

  const submit = async () => {
    if (!name.trim()) return Alert.alert("Name needed", "Enter the person's name.");
    setBusy(true);
    try {
      await api.createPickupAuthorization({ name: name.trim(), relation, phone: phone.trim() || undefined, flatId });
      onDone();
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
            <Text style={styles.modalTitle}>Add pickup person</Text>
          </LinearGradient>
          <View style={styles.modalBody}>
            <Text style={styles.label}>Name *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Ramesh (grandfather)" />
            <Text style={styles.label}>Relation</Text>
            <View style={styles.chipRow}>
              {RELATIONS.map((r) => (
                <TouchableOpacity key={r} style={[styles.chip, relation === r && styles.chipActive]} onPress={() => setRelation(r)}>
                  <Text style={[styles.chipText, relation === r && { color: "#fff" }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="10-digit mobile" keyboardType="phone-pad" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.cancelBtn]} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}><Text style={styles.mBtnText}>{busy ? "Saving…" : "Add"}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

function PostUpdateModal({ visible, onClose, flatId, onDone }) {
  const [type, setType] = useState("meal");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setType("meal"); setText(""); } }, [visible]);

  const submit = async () => {
    if (!text.trim()) return Alert.alert("Add a note", "Write the update text.");
    setBusy(true);
    try {
      await api.createChildUpdate({ flatId, type, text: text.trim() });
      onDone();
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
            <Text style={styles.modalTitle}>Post update</Text>
          </LinearGradient>
          <View style={styles.modalBody}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipRow}>
              {UPDATE_TYPES.map((t) => (
                <TouchableOpacity key={t.id} style={[styles.chip, type === t.id && styles.chipActive]} onPress={() => setType(t.id)}>
                  <Ionicons name={t.icon} size={13} color={type === t.id ? "#fff" : t.color} />
                  <Text style={[styles.chipText, type === t.id && { color: "#fff" }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Update</Text>
            <TextInput style={[styles.input, styles.multiline]} value={text} onChangeText={setText} placeholder="e.g. Ate all lunch and enjoyed painting today!" multiline />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.cancelBtn]} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}><Text style={styles.mBtnText}>{busy ? "Posting…" : "Post"}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  pickLabel: { fontSize: 13, fontWeight: "700", color: "#334", marginBottom: 6 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33" },
  link: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  muted: { color: "#8895A0", fontSize: 13.5, lineHeight: 19 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10, paddingHorizontal: 30 },
  emptyText: { color: "#8895A0", fontSize: 14, fontWeight: "600", textAlign: "center", lineHeight: 20 },
  card: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14 },
  updateRow: { flexDirection: "row", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  updateIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  updateText: { color: "#1B2B33", fontSize: 14, fontWeight: "600" },
  updateMeta: { color: "#8895A0", fontSize: 11.5, marginTop: 3 },
  pickCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  pickAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pickAvatarImg: { width: 40, height: 40 },
  pickName: { fontWeight: "800", color: "#1B2B33", fontSize: 14 },
  pickSub: { color: "#6B7B85", fontSize: 12, marginTop: 1 },
  pickBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#F1F6F8", alignItems: "center", justifyContent: "center" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: "#EEF2F4" },
  eventName: { fontWeight: "700", color: "#1B2B33", fontSize: 13.5 },
  eventMeta: { color: "#8895A0", fontSize: 12, marginTop: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  qrCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  qrHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 16 },
  qrHeaderText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  qrBody: { alignItems: "center", padding: 22 },
  qrImg: { width: 220, height: 220 },
  qrHint: { color: "#6B7B85", fontSize: 12.5, textAlign: "center", marginTop: 14, lineHeight: 18 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { paddingHorizontal: 18, paddingVertical: 16 },
  modalTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  modalBody: { padding: 18 },
  label: { fontSize: 13, fontWeight: "700", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  chipText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  mBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "800" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
