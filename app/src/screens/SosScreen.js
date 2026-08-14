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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";

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

  const raise = (type) => {
    const meta = TYPES.find((t) => t.id === type);
    Alert.alert(`Raise ${meta.label} SOS?`, "This alerts the guards, admins and nearby responders immediately.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send SOS",
        style: "destructive",
        onPress: async () => {
          setRaising(true);
          try {
            await api.raiseSos({ type });
            await load();
            Alert.alert("SOS sent", "Guards and responders have been alerted. Stay where you are if safe.");
          } catch (e) {
            Alert.alert("Error", e.message);
          } finally {
            setRaising(false);
          }
        },
      },
    ]);
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
                      <Text style={styles.alertTime}>{new Date(al.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{al.note ? ` · ${al.note}` : ""}</Text>
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
        <View style={styles.typeGrid}>
          {TYPES.map((t) => (
            <TouchableOpacity key={t.id} style={[styles.typeBtn, raising && { opacity: 0.5 }]} onPress={() => raise(t.id)} disabled={raising} activeOpacity={0.8}>
              <LinearGradient colors={[t.color, t.color + "CC"]} style={styles.typeGrad}>
                <Ionicons name={t.icon} size={26} color="#fff" />
              </LinearGradient>
              <Text style={styles.typeLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

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
  responders: { color: "#1E7A3D", fontSize: 12.5, fontWeight: "600", marginTop: 10 },
  alertActions: { flexDirection: "row", gap: 10, marginTop: 12, alignItems: "center" },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: "#fff", fontWeight: "700", fontSize: 12.5 },
  respondedTag: { color: "#1E7A3D", fontWeight: "700", fontSize: 12.5 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  typeBtn: { width: "47%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 16, paddingVertical: 16, alignItems: "center", gap: 10 },
  typeGrad: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontWeight: "800", color: "#1B2B33", fontSize: 14 },
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
