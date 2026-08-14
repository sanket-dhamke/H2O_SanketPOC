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

const statusMeta = {
  draft: { label: "Draft", color: "#6B7B85", bg: "#EEF2F4" },
  open: { label: "Voting open", color: "#1E7A3D", bg: "#EAF7EF" },
  closed: { label: "Closed", color: "#0B6E8F", bg: "#E7F3F7" },
};

export default function AgmScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isResident = user?.role === "resident";
  const [meetings, setMeetings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { meetings } = await api.meetings();
      setMeetings(meetings || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const setStatus = async (m, status) => {
    setBusyId(m.id);
    try { await api.setMeetingStatus(m.id, status); await load(); }
    catch (e) { Alert.alert("Error", e.message); }
    finally { setBusyId(null); }
  };

  const vote = async (motionId, choice) => {
    try { await api.voteMotion(motionId, choice); await load(); }
    catch (e) { Alert.alert("Error", e.message); }
  };

  const addBtn = isAdmin ? (
    <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  ) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader icon="people" title="AGM & voting" subtitle="Motions, e-voting, quorum & minutes" onBack={() => navigation.goBack()} right={addBtn} />
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {meetings.length === 0 && <Text style={styles.empty}>No meetings yet.</Text>}
        {meetings.map((m) => {
          const sm = statusMeta[m.status] || statusMeta.draft;
          const quorum = m.flatCount ? Math.round((m.attendCount / m.flatCount) * 100) : 0;
          return (
            <View key={m.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.title}>{m.title}</Text>
                <View style={[styles.badge, { backgroundColor: sm.bg }]}><Text style={[styles.badgeText, { color: sm.color }]}>{sm.label}</Text></View>
              </View>
              {!!m.agenda && <Text style={styles.agenda}>{m.agenda}</Text>}
              <Text style={styles.quorum}>
                Turnout {m.attendCount}/{m.flatCount} flats ({quorum}%) · quorum {m.quorumPct}%
                {m.quorumMet ? "  ✓ met" : ""}
              </Text>

              {m.motions.map((mo) => {
                const total = mo.total || 0;
                const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
                return (
                  <View key={mo.id} style={styles.motion}>
                    <Text style={styles.motionTitle}>{mo.title}</Text>
                    {!!mo.detail && <Text style={styles.motionDetail}>{mo.detail}</Text>}
                    {m.status !== "draft" && (
                      <View style={styles.tallyRow}>
                        <Tally label="Yes" n={mo.tally.yes} pct={pct(mo.tally.yes)} color="#2E9E52" />
                        <Tally label="No" n={mo.tally.no} pct={pct(mo.tally.no)} color="#B42318" />
                        <Tally label="Abstain" n={mo.tally.abstain} pct={pct(mo.tally.abstain)} color="#8895A0" />
                      </View>
                    )}
                    {mo.result && <Text style={[styles.result, { color: mo.result === "passed" ? "#1E7A3D" : mo.result === "rejected" ? "#B42318" : "#6B7B85" }]}>Result: {mo.result.toUpperCase()}</Text>}
                    {isResident && m.status === "open" && (
                      <View style={styles.voteRow}>
                        {["yes", "no", "abstain"].map((c) => (
                          <TouchableOpacity key={c} style={[styles.voteBtn, mo.myVote === c && styles.voteBtnActive]} onPress={() => vote(mo.id, c)}>
                            <Text style={[styles.voteText, mo.myVote === c && { color: "#fff" }]}>{c[0].toUpperCase() + c.slice(1)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              {!!m.minutes && (
                <View style={styles.minutes}>
                  <Text style={styles.minutesTitle}>Minutes</Text>
                  <Text style={styles.minutesText}>{m.minutes}</Text>
                </View>
              )}

              {isAdmin && (
                <View style={styles.adminRow}>
                  {m.status === "draft" && (
                    <TouchableOpacity style={styles.adminBtn} onPress={() => setStatus(m, "open")} disabled={busyId === m.id}>
                      <Ionicons name="play" size={15} color="#fff" /><Text style={styles.adminBtnText}>Open voting</Text>
                    </TouchableOpacity>
                  )}
                  {m.status === "open" && (
                    <TouchableOpacity style={[styles.adminBtn, { backgroundColor: "#B4620A" }]} onPress={() => setStatus(m, "closed")} disabled={busyId === m.id}>
                      <Ionicons name="stop" size={15} color="#fff" /><Text style={styles.adminBtnText}>Close & summarise</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      <MeetingModal visible={modal} onClose={() => setModal(false)} onDone={load} />
    </View>
  );
}

const Tally = ({ label, n, pct, color }) => (
  <View style={styles.tally}>
    <Text style={styles.tallyLabel}>{label}</Text>
    <View style={styles.tallyBarBg}><View style={[styles.tallyBarFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
    <Text style={styles.tallyNum}>{n}</Text>
  </View>
);
const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

function MeetingModal({ visible, onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [quorumPct, setQuorumPct] = useState("50");
  const [scheduledAt, setScheduledAt] = useState("");
  const [motions, setMotions] = useState([{ title: "", detail: "" }]);
  const [busy, setBusy] = useState(false);

  const reset = () => { setTitle(""); setAgenda(""); setQuorumPct("50"); setScheduledAt(""); setMotions([{ title: "", detail: "" }]); };
  const setMotion = (i, key, val) => setMotions((ms) => ms.map((m, idx) => (idx === i ? { ...m, [key]: val } : m)));

  const submit = async () => {
    if (!title.trim()) return Alert.alert("Missing info", "Enter a meeting title.");
    const clean = motions.filter((m) => m.title.trim()).map((m) => ({ title: m.title.trim(), detail: m.detail.trim() || undefined }));
    if (!clean.length) return Alert.alert("Add a motion", "Add at least one motion to vote on.");
    setBusy(true);
    try {
      await api.createMeeting({ title: title.trim(), agenda: agenda.trim() || undefined, quorumPct: Number(quorumPct) || 50, scheduledAt: scheduledAt || undefined, motions: clean });
      reset(); onClose(); onDone();
    } catch (e) { Alert.alert("Error", e.message); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>New meeting</Text></View>
          <ScrollView style={{ maxHeight: 540 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Title</Label>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Annual General Meeting 2026" />
            <Label>Agenda (optional)</Label>
            <TextInput style={[styles.input, styles.multiline]} value={agenda} onChangeText={setAgenda} placeholder="Points for discussion…" multiline />
            <Label>Date (optional)</Label>
            <DateField value={scheduledAt} onChange={setScheduledAt} placeholder="Select date" />
            <Label>Quorum %</Label>
            <TextInput style={styles.input} value={quorumPct} onChangeText={setQuorumPct} placeholder="50" keyboardType="numeric" />
            <Label>Motions to vote on</Label>
            {motions.map((m, i) => (
              <View key={i} style={styles.motionEdit}>
                <TextInput style={styles.input} value={m.title} onChangeText={(v) => setMotion(i, "title", v)} placeholder={`Motion ${i + 1} title`} />
                <TextInput style={[styles.input, { marginTop: 8 }]} value={m.detail} onChangeText={(v) => setMotion(i, "detail", v)} placeholder="Detail (optional)" />
              </View>
            ))}
            <TouchableOpacity style={styles.addMotion} onPress={() => setMotions((ms) => [...ms, { title: "", detail: "" }])}>
              <Ionicons name="add-circle-outline" size={16} color="#0B6E8F" /><Text style={styles.addMotionText}>Add another motion</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.mCancel]} onPress={onClose}><Text style={styles.mCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}><Text style={styles.mBtnText}>{busy ? "Creating…" : "Create"}</Text></TouchableOpacity>
            </View>
          </ScrollView>
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
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { fontWeight: "800", color: "#1B2B33", fontSize: 15.5, flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontWeight: "800", fontSize: 11 },
  agenda: { color: "#48606B", fontSize: 13, marginTop: 8, lineHeight: 19 },
  quorum: { color: "#6B7B85", fontSize: 12, marginTop: 8, fontWeight: "600" },
  motion: { backgroundColor: "#F8FAFB", borderRadius: 10, padding: 12, marginTop: 10 },
  motionTitle: { fontWeight: "700", color: "#1B2B33", fontSize: 14 },
  motionDetail: { color: "#6B7B85", fontSize: 12.5, marginTop: 3 },
  tallyRow: { marginTop: 10, gap: 6 },
  tally: { flexDirection: "row", alignItems: "center", gap: 8 },
  tallyLabel: { width: 54, fontSize: 12, color: "#6B7B85", fontWeight: "600" },
  tallyBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#EAEFF2", overflow: "hidden" },
  tallyBarFill: { height: 8, borderRadius: 4 },
  tallyNum: { width: 24, textAlign: "right", fontSize: 12, color: "#1B2B33", fontWeight: "700" },
  result: { marginTop: 8, fontWeight: "800", fontSize: 12.5 },
  voteRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  voteBtn: { flex: 1, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  voteBtnActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  voteText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  minutes: { backgroundColor: "#F5F0FE", borderRadius: 10, padding: 12, marginTop: 12 },
  minutesTitle: { fontWeight: "800", color: "#6D3BD1", marginBottom: 6 },
  minutesText: { color: "#3B3357", fontSize: 12.5, lineHeight: 19 },
  adminRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  adminBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1E7A3D", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  adminBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { backgroundColor: "#0B6E8F", paddingHorizontal: 18, paddingVertical: 16 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  modalBody: { padding: 20, paddingTop: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  motionEdit: { marginTop: 8, backgroundColor: "#F8FAFB", borderRadius: 10, padding: 10 },
  addMotion: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  addMotionText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  mBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "700" },
  mCancel: { backgroundColor: "#EEF2F4" },
  mCancelText: { color: "#6B7B85", fontWeight: "700" },
});
