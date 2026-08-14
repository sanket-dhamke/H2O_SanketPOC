import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal } from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import ScreenHeader from "../components/ScreenHeader";
import KeyboardAvoider from "../components/KeyboardAvoider";

const DEPOSIT = [
  { id: "held", label: "Held" },
  { id: "partially_returned", label: "Part-returned" },
  { id: "returned", label: "Returned" },
  { id: "forfeited", label: "Forfeited" },
];
const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

function progress(checks) {
  if (!Array.isArray(checks) || !checks.length) return 0;
  return Math.round((checks.filter((c) => c.done).length / checks.length) * 100);
}

export default function RentalComplianceScreen() {
  const navigation = useNavigation();
  const [flats, setFlats] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    try {
      const { flats } = await api.rentalCompliance();
      setFlats(flats || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.container}>
      <ScreenHeader icon="document-text" title="Rental compliance" subtitle="Verification, checklists & deposits" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color="#0B6E8F" />
          <Text style={styles.infoText}>Rented flats appear here. Track police verification, the move-in/out checklist and the security deposit for each tenancy.</Text>
        </View>
        {flats.length === 0 && <Text style={styles.empty}>No rented flats yet. Mark a flat as rented in Maintenance.</Text>}
        {flats.map((f) => {
          const c = f.compliance;
          return (
            <TouchableOpacity key={f.flatId} style={styles.card} onPress={() => setEdit(f)} activeOpacity={0.85}>
              <View style={styles.cardHead}>
                <Text style={styles.flatNo}>{f.flatNo}</Text>
                {c?.policeVerified ? (
                  <View style={[styles.pill, { backgroundColor: "#EAF7EF" }]}><Ionicons name="shield-checkmark" size={12} color="#1E7A3D" /><Text style={[styles.pillText, { color: "#1E7A3D" }]}>Verified</Text></View>
                ) : (
                  <View style={[styles.pill, { backgroundColor: "#FDF1E3" }]}><Ionicons name="alert-circle-outline" size={12} color="#B4620A" /><Text style={[styles.pillText, { color: "#B4620A" }]}>Not verified</Text></View>
                )}
              </View>
              {!!f.ownerName && <Text style={styles.owner}>Owner: {f.ownerName}</Text>}
              {c ? (
                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>Move-in {progress(c.moveInChecks)}%</Text>
                  <Text style={styles.progressLabel}>Deposit: {DEPOSIT.find((d) => d.id === c.depositStatus)?.label || "—"}{c.depositAmount ? ` · ${money(c.depositAmount)}` : ""}</Text>
                </View>
              ) : (
                <Text style={styles.setup}>Tap to set up compliance →</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <ComplianceModal flat={edit} onClose={() => setEdit(null)} onDone={load} />
    </View>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

function ComplianceModal({ flat, onClose, onDone }) {
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!flat) { setC(null); return; }
    api.flatCompliance(flat.flatId).then(({ compliance }) => setC(compliance)).catch((e) => Alert.alert("Error", e.message));
  }, [flat]);

  const toggle = (list, i) => setC((prev) => ({ ...prev, [list]: prev[list].map((x, idx) => (idx === i ? { ...x, done: !x.done } : x)) }));
  const set = (k, v) => setC((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await api.saveCompliance(flat.flatId, {
        policeVerified: c.policeVerified,
        policeRef: c.policeRef,
        moveInChecks: c.moveInChecks,
        moveOutChecks: c.moveOutChecks,
        depositAmount: c.depositAmount,
        depositStatus: c.depositStatus,
        depositNote: c.depositNote,
      });
      onClose(); onDone();
    } catch (e) { Alert.alert("Error", e.message); } finally { setBusy(false); }
  };

  return (
    <Modal visible={!!flat} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Compliance · {flat?.flatNo}</Text></View>
          {c && (
            <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={styles.verifyRow} onPress={() => set("policeVerified", !c.policeVerified)}>
                <Ionicons name={c.policeVerified ? "checkbox" : "square-outline"} size={22} color="#1E7A3D" />
                <Text style={styles.verifyText}>Police tenant verification done</Text>
              </TouchableOpacity>
              <Label>Police verification ref (optional)</Label>
              <TextInput style={styles.input} value={c.policeRef || ""} onChangeText={(v) => set("policeRef", v)} placeholder="Acknowledgement no." />

              <Label>Move-in checklist</Label>
              {c.moveInChecks.map((x, i) => (
                <TouchableOpacity key={i} style={styles.check} onPress={() => toggle("moveInChecks", i)}>
                  <Ionicons name={x.done ? "checkbox" : "square-outline"} size={20} color={x.done ? "#0B6E8F" : "#8895A0"} />
                  <Text style={[styles.checkText, x.done && { color: "#1B2B33" }]}>{x.label}</Text>
                </TouchableOpacity>
              ))}

              <Label>Move-out checklist</Label>
              {c.moveOutChecks.map((x, i) => (
                <TouchableOpacity key={i} style={styles.check} onPress={() => toggle("moveOutChecks", i)}>
                  <Ionicons name={x.done ? "checkbox" : "square-outline"} size={20} color={x.done ? "#0B6E8F" : "#8895A0"} />
                  <Text style={[styles.checkText, x.done && { color: "#1B2B33" }]}>{x.label}</Text>
                </TouchableOpacity>
              ))}

              <Label>Security deposit (Rs.)</Label>
              <TextInput style={styles.input} value={c.depositAmount != null ? String(c.depositAmount) : ""} onChangeText={(v) => set("depositAmount", v)} placeholder="e.g. 50000" keyboardType="numeric" />
              <Label>Deposit status</Label>
              <View style={styles.depRow}>
                {DEPOSIT.map((d) => (
                  <TouchableOpacity key={d.id} style={[styles.depOpt, c.depositStatus === d.id && styles.depActive]} onPress={() => set("depositStatus", d.id)}>
                    <Text style={[styles.depText, c.depositStatus === d.id && { color: "#fff" }]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Label>Deposit note (optional)</Label>
              <TextInput style={styles.input} value={c.depositNote || ""} onChangeText={(v) => set("depositNote", v)} placeholder="Deductions / remarks" />

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.mBtn, styles.mCancel]} onPress={onClose}><Text style={styles.mCancelText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}><Text style={styles.mBtnText}>{busy ? "Saving…" : "Save"}</Text></TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  infoBox: { flexDirection: "row", gap: 8, backgroundColor: "#E7F3F7", borderRadius: 12, padding: 12, marginBottom: 12 },
  infoText: { flex: 1, color: "#0B6E8F", fontSize: 12.5, lineHeight: 18 },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 20 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  flatNo: { fontWeight: "800", color: "#1B2B33", fontSize: 16 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontWeight: "800", fontSize: 11 },
  owner: { color: "#6B7B85", fontSize: 12.5, marginTop: 6 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  progressLabel: { color: "#48606B", fontSize: 12, fontWeight: "600" },
  setup: { color: "#0B6E8F", fontSize: 12.5, fontWeight: "700", marginTop: 8 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { backgroundColor: "#0B6E8F", paddingHorizontal: 18, paddingVertical: 16 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  modalBody: { padding: 20, paddingTop: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  verifyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  verifyText: { fontWeight: "700", color: "#1B2B33", fontSize: 14 },
  check: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  checkText: { color: "#6B7B85", fontSize: 13.5, flex: 1 },
  depRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  depOpt: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  depActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  depText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 22 },
  mBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "700" },
  mCancel: { backgroundColor: "#EEF2F4" },
  mCancelText: { color: "#6B7B85", fontWeight: "700" },
});
