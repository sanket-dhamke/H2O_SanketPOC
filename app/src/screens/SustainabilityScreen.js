import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal } from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { brand } from "../lib/brand";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";
import KeyboardAvoider from "../components/KeyboardAvoider";
import FlatPicker from "../components/FlatPicker";

const scoreBand = (s) =>
  s >= 80 ? { label: "Excellent", color: "#1E7A3D" } : s >= 60 ? { label: "Good", color: "#0B6E8F" } : s >= 40 ? { label: "Fair", color: "#B4620A" } : { label: "High usage", color: "#B42318" };
const litres = (n) => `${Number(n || 0).toLocaleString("en-IN")} L`;

export default function SustainabilityScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.sustainability();
      setData(d);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const addBtn = isAdmin ? (
    <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  ) : null;

  const band = data ? scoreBand(data.societyScore) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="leaf"
        title="Sustainability"
        subtitle="Green score & water metering"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("MaintenanceHome"))}
        right={addBtn}
      />
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.howCard}>
          <Text style={styles.howKicker}>How we capture this</Text>
          <Text style={styles.howTitle}>Water readings, not your maintenance bill</Text>
          <Text style={styles.howText}>
            The office records litres used this month for each flat (admin tap + , or a CSV import). {brand.name} compares every flat with the society median: 100 at zero use, 50 at the median, lower if you use more than neighbours. The community score is the average of reported flats.
          </Text>
          <Text style={styles.howText}>
            {isAdmin
              ? "Tap + to add this month’s reading. Residents then see their own flat, the median, and a top-savers list. This does not change what anyone pays in maintenance."
              : "If your flat says “no reading yet”, ask the office to enter this month’s meter. Lower litres = higher score. This does not change your maintenance bill."}
          </Text>
        </View>
        {data && (
          <>
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Community green score · {data.period}</Text>
              <Text style={[styles.scoreValue, { color: band.color }]}>{data.societyScore}</Text>
              <Text style={[styles.scoreBand, { color: band.color }]}>{band.label}</Text>
              <Text style={styles.scoreHint}>Higher is better — flats using less than the community median score higher.</Text>
            </View>

            {data.mine && (
              <View style={styles.mineCard}>
                <Ionicons name="home-outline" size={18} color="#1E7A3D" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mineTitle}>Your flat</Text>
                  <Text style={styles.mineText}>
                    {data.mine.litres != null ? `${litres(data.mine.litres)} this month · score ${data.mine.score}` : "No reading recorded yet."}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.statRow}>
              <Stat label="Median use" value={litres(data.median)} />
              <Stat label="Total use" value={litres(data.totalLitres)} />
              <Stat label="Reported" value={`${data.reportedFlats}/${data.flatCount}`} />
            </View>

            <Text style={styles.sectionTitle}>Top savers</Text>
            {data.leaderboard.length === 0 && <Text style={styles.empty}>No readings recorded yet.</Text>}
            {data.leaderboard.map((r, i) => {
              const b = scoreBand(r.score);
              return (
                <View key={i} style={styles.lbRow}>
                  <Text style={styles.lbRank}>{i + 1}</Text>
                  <Text style={styles.lbFlat}>{r.flatNo}</Text>
                  <Text style={styles.lbLitres}>{litres(r.litres)}</Text>
                  <View style={[styles.lbScore, { backgroundColor: b.color }]}><Text style={styles.lbScoreText}>{r.score}</Text></View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      <ReadingModal visible={modal} onClose={() => setModal(false)} onDone={load} period={data?.period} />
    </View>
  );
}

const Stat = ({ label, value }) => (
  <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>
);
const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

function ReadingModal({ visible, onClose, onDone, period }) {
  const [flats, setFlats] = useState([]);
  const [flatId, setFlatId] = useState(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    api.flats().then((r) => setFlats((r.flats || []).map((f) => ({ id: f.id, flatNo: f.flatNo, block: f.block })))).catch(() => {});
  }, [visible]);

  const submit = async () => {
    if (!flatId) return Alert.alert("Select a flat", "Pick the flat to record a reading for.");
    setBusy(true);
    try {
      await api.saveWaterReading({ flatId, litres: Number(value) || 0, period });
      setFlatId(null); setValue(""); onClose(); onDone();
    } catch (e) { Alert.alert("Error", e.message); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Record water reading</Text></View>
          <View style={styles.modalBody}>
            <Label>Flat</Label>
            <FlatPicker flats={flats} value={flatId} onChange={setFlatId} />
            <Label>Litres used this month</Label>
            <TextInput style={styles.input} value={value} onChangeText={setValue} placeholder="e.g. 12000" keyboardType="numeric" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.mCancel]} onPress={onClose}><Text style={styles.mCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}><Text style={styles.mBtnText}>{busy ? "Saving…" : "Save"}</Text></TouchableOpacity>
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
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 12 },
  scoreCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20, alignItems: "center" },
  scoreLabel: { color: "#6B7B85", fontSize: 13, fontWeight: "600" },
  scoreValue: { fontSize: 56, fontWeight: "900", marginTop: 6 },
  scoreBand: { fontSize: 15, fontWeight: "800", marginTop: -4 },
  scoreHint: { color: "#8895A0", fontSize: 12, textAlign: "center", marginTop: 10, lineHeight: 17 },
  mineCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EAF7EF", borderRadius: 12, padding: 14, marginTop: 12 },
  mineTitle: { fontWeight: "800", color: "#1E7A3D", fontSize: 13 },
  mineText: { color: "#3B5A47", fontSize: 12.5, marginTop: 2 },
  statRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  stat: { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 14, alignItems: "center" },
  statValue: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  statLabel: { color: "#8895A0", fontSize: 11, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 20, marginBottom: 8 },
  lbRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  lbRank: { width: 20, fontWeight: "800", color: "#8895A0" },
  lbFlat: { flex: 1, fontWeight: "700", color: "#1B2B33" },
  lbLitres: { color: "#6B7B85", fontSize: 12.5 },
  lbScore: { minWidth: 34, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignItems: "center" },
  lbScoreText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { backgroundColor: "#1E7A3D", paddingHorizontal: 18, paddingVertical: 16 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  modalBody: { padding: 20, paddingTop: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  mBtn: { flex: 1, backgroundColor: "#1E7A3D", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "700" },
  mCancel: { backgroundColor: "#EEF2F4" },
  mCancelText: { color: "#6B7B85", fontWeight: "700" },
  howCard: { backgroundColor: "#EAF7EF", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#C7E4D0" },
  howKicker: { color: "#1E7A3D", fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  howTitle: { color: "#1B3D24", fontSize: 16, fontWeight: "800", marginTop: 4 },
  howText: { color: "#3B5A47", fontSize: 13, lineHeight: 19, marginTop: 8 },
});
