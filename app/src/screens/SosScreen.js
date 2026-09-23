import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Switch,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";
import AppTextInput from "../components/AppTextInput";

const TYPES = [
  { id: "medical", label: "Medical", icon: "medkit", color: "#B42318" },
  { id: "security", label: "Security", icon: "shield", color: "#C2571A" },
  { id: "fire", label: "Fire", icon: "flame", color: "#D9480F" },
  { id: "other", label: "Other", icon: "alert-circle", color: "#6D3BD1" },
];
const SKILLS = [
  { id: "doctor", label: "Doctor" },
  { id: "nurse", label: "Nurse" },
  { id: "first_aid", label: "First aid" },
  { id: "security", label: "Security-trained" },
  { id: "other", label: "Other" },
];
const cleanPhone = (p) => String(p || "").replace(/[^\d+]/g, "");

export default function SosScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [helpline, setHelpline] = useState([]);
  const [responder, setResponder] = useState({ isResponder: false, responderSkill: null });
  const [refreshing, setRefreshing] = useState(false);
  const [raising, setRaising] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState(null);
  const [noticeError, setNoticeError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, h, r] = await Promise.all([api.activeSos(), api.sosHelpline().catch(() => ({ numbers: [] })), api.sosResponderSettings().catch(() => ({}))]);
      setAlerts(a.alerts || []);
      setHelpline(h.numbers || []);
      setResponder({ isResponder: !!r.isResponder, responderSkill: r.responderSkill || null });
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Confirm on the page. The browser build's Alert.alert does nothing, so a
  // tap on Medical / Fire / Security / Other used to look dead.
  const sendPending = async () => {
    if (!pendingType || raising) return;
    const type = pendingType;
    const detail = note.trim().slice(0, 240);
    if (type === "other" && detail.length < 3) {
      setNoticeError(true);
      setNotice("Write what this is. Other does not tell anyone the emergency on its own.");
      return;
    }
    setRaising(true);
    setNotice(null);
    setNoticeError(false);
    try {
      await api.raiseSos({ type, note: detail || undefined });
      await load();
      setPendingType(null);
      setNote("");
      setNoticeError(false);
      setNotice("SOS sent. Guards and responders have been alerted. Stay where you are if it is safe.");
    } catch (e) {
      setNoticeError(true);
      setNotice(e.message || "Could not send the alert.");
    } finally {
      setRaising(false);
    }
  };

  const respond = async (id) => {
    try { await api.respondSos(id); await load(); } catch (e) { Alert.alert("Error", e.message); }
  };
  const resolve = async (id) => {
    try { await api.resolveSos(id, false); await load(); } catch (e) { Alert.alert("Error", e.message); }
  };

  const toggleResponder = async (val) => {
    try {
      const r = await api.setSosResponder({ isResponder: val, responderSkill: responder.responderSkill || "first_aid" });
      setResponder({ isResponder: r.isResponder, responderSkill: r.responderSkill });
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };
  const pickSkill = async (skill) => {
    try {
      const r = await api.setSosResponder({ isResponder: true, responderSkill: skill });
      setResponder({ isResponder: r.isResponder, responderSkill: r.responderSkill });
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const ambulance = helpline[0];

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="alert"
        title="Emergency SOS"
        subtitle="One tap alerts guards & neighbours"
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Active alerts */}
        {alerts.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>Active alerts</Text>
            {alerts.map((al) => {
              const meta = TYPES.find((t) => t.id === al.type) || TYPES[3];
              const mine = al.raisedById === user?.id;
              const iResponded = (al.responses || []).some((r) => r.responderId === user?.id);
              return (
                <View key={al.id} style={[styles.alertCard, { borderColor: meta.color }]}>
                  <View style={styles.alertTop}>
                    <View style={[styles.alertIcon, { backgroundColor: meta.color }]}>
                      <Ionicons name={meta.icon} size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertName}>{meta.label} · {al.raiserName || "Resident"}{al.raiserFlatNo ? ` (${al.raiserFlatNo})` : ""}</Text>
                      <Text style={styles.alertTime}>{new Date(al.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                      {al.note ? <Text style={styles.alertNote}>{al.note}</Text> : null}
                    </View>
                  </View>
                  {(al.responses || []).length > 0 && (
                    <Text style={styles.responders}>
                      {al.responses.length} responding: {al.responses.map((r) => r.responderName || "Neighbour").join(", ")}
                    </Text>
                  )}
                  <View style={styles.alertActions}>
                    {!mine && !iResponded && (
                      <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#1E7A3D" }]} onPress={() => respond(al.id)}>
                        <Ionicons name="hand-right" size={15} color="#fff" />
                        <Text style={styles.smallBtnText}>I'm coming</Text>
                      </TouchableOpacity>
                    )}
                    {iResponded && !mine && <Text style={styles.respondedTag}>✓ You're responding</Text>}
                    {(mine || user?.role === "admin") && (
                      <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#6B7B85" }]} onPress={() => resolve(al.id)}>
                        <Ionicons name="checkmark" size={15} color="#fff" />
                        <Text style={styles.smallBtnText}>Mark safe</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Panic buttons */}
        <Text style={styles.sectionTitle}>Raise an alert</Text>
        <View style={styles.typeCard}>
          {TYPES.map((t, i) => {
            const selected = pendingType === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeRow, i > 0 && styles.typeRowBorder, selected && { backgroundColor: "#F8FBFC" }]}
                onPress={() => {
                  setNotice(null);
                  setNoticeError(false);
                  setNote("");
                  setPendingType(selected ? null : t.id);
                }}
                disabled={raising}
                activeOpacity={0.7}
              >
                <View style={[styles.typeIcon, { backgroundColor: t.color }]}>
                  <Ionicons name={t.icon} size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.typeLabel}>{t.label}</Text>
                  <Text style={styles.typeHint}>
                    {t.id === "other" ? "Not medical, security, or fire. You write what it is." : "Tap to alert guards and neighbours"}
                  </Text>
                </View>
                <Ionicons name={selected ? "chevron-up" : "chevron-forward"} size={18} color="#9AA7AF" />
              </TouchableOpacity>
            );
          })}
        </View>
        {pendingType ? (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>
              {pendingType === "other"
                ? "Send an Other alert now? Write what is happening. Guards, admins and nearby responders get your name, flat, and this note."
                : `Send a ${TYPES.find((t) => t.id === pendingType)?.label} alert now? Guards, admins and nearby responders are notified immediately. A short detail helps them.`}
            </Text>
            <AppTextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder={pendingType === "other" ? "What is happening?" : "Add a detail (optional)"}
              maxLength={240}
            />
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancel}
                onPress={() => {
                  setPendingType(null);
                  setNote("");
                }}
                disabled={raising}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmSend, raising && { opacity: 0.6 }]} onPress={sendPending} disabled={raising}>
                <Text style={styles.confirmSendText}>{raising ? "Sending…" : "Send SOS"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {notice ? <Text style={[styles.notice, noticeError && styles.noticeError]}>{notice}</Text> : null}

        {/* Ambulance / emergency numbers */}
        <Text style={styles.sectionTitle}>One-tap help</Text>
        {ambulance ? (
          <TouchableOpacity style={styles.ambBtn} onPress={() => Linking.openURL(`tel:${cleanPhone(ambulance.phone)}`)}>
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.ambText}>Call {ambulance.subtype || ambulance.name} · {ambulance.phone}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.muted}>No emergency number set. Ask your admin to add an ambulance number under Services & helplines.</Text>
        )}
        {helpline.slice(1, 5).map((h, i) => (
          <TouchableOpacity key={i} style={styles.helpRow} onPress={() => Linking.openURL(`tel:${cleanPhone(h.phone)}`)}>
            <Ionicons name="call-outline" size={16} color="#0B6E8F" />
            <Text style={styles.helpText}>{h.subtype || h.name}</Text>
            <Text style={styles.helpPhone}>{h.phone}</Text>
          </TouchableOpacity>
        ))}

        {/* Responder opt-in */}
        <Text style={styles.sectionTitle}>Be a responder</Text>
        <View style={styles.card}>
          <View style={styles.responderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.responderTitle}>Join the responder mesh</Text>
              <Text style={styles.responderSub}>Get alerted to nearby emergencies so you can help.</Text>
            </View>
            <Switch value={responder.isResponder} onValueChange={toggleResponder} trackColor={{ true: "#1E7A3D" }} />
          </View>
          {responder.isResponder && (
            <View style={styles.skillRow}>
              {SKILLS.map((s) => (
                <TouchableOpacity key={s.id} style={[styles.skillChip, responder.responderSkill === s.id && styles.skillChipActive]} onPress={() => pickSkill(s.id)}>
                  <Text style={[styles.skillText, responder.responderSkill === s.id && { color: "#fff" }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 20, marginBottom: 12 },
  muted: { color: "#8895A0", fontSize: 13, lineHeight: 19 },
  alertCard: { backgroundColor: "#fff", borderRadius: 14, borderLeftWidth: 4, padding: 14, marginBottom: 10 },
  alertTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  alertIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  alertName: { fontWeight: "800", color: "#1B2B33", fontSize: 14 },
  alertTime: { color: "#8895A0", fontSize: 12, marginTop: 2 },
  alertNote: { color: "#1B2B33", fontSize: 13.5, lineHeight: 19, marginTop: 8 },
  responders: { color: "#1E7A3D", fontSize: 12.5, fontWeight: "600", marginTop: 10 },
  alertActions: { flexDirection: "row", gap: 10, marginTop: 12, alignItems: "center" },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: "#fff", fontWeight: "700", fontSize: 12.5 },
  respondedTag: { color: "#1E7A3D", fontWeight: "700", fontSize: 12.5 },
  typeCard: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E2EAEE", overflow: "hidden" },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  typeRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E6EEF2" },
  typeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  typeHint: { color: "#6B7B85", fontSize: 12.5, marginTop: 2 },
  confirmBox: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#F3C4C0", padding: 14, marginTop: 10 },
  confirmText: { color: "#1B2B33", fontSize: 14, lineHeight: 20 },
  noteInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E2EAEE",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#F8FBFC",
  },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  confirmCancel: { flex: 1, backgroundColor: "#EEF2F4", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  confirmCancelText: { color: "#5C7380", fontWeight: "700" },
  confirmSend: { flex: 1, backgroundColor: "#B42318", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  confirmSendText: { color: "#fff", fontWeight: "800" },
  notice: { color: "#1E7A3D", fontWeight: "700", fontSize: 13.5, lineHeight: 19, marginTop: 10 },
  noticeError: { color: "#B42318" },
  ambBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#B42318", borderRadius: 14, paddingVertical: 16 },
  ambText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  helpRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, padding: 13, marginTop: 8 },
  helpText: { flex: 1, color: "#1B2B33", fontWeight: "700", fontSize: 13.5 },
  helpPhone: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  responderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  responderTitle: { fontWeight: "800", color: "#1B2B33", fontSize: 14 },
  responderSub: { color: "#6B7B85", fontSize: 12.5, marginTop: 2 },
  skillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  skillChip: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  skillChipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  skillText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
});
