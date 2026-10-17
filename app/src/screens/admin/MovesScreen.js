import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal, TextInput } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { labelsFor } from "../../lib/org";
import { useAuth } from "../../lib/auth";
import ScreenHeader from "../../components/ScreenHeader";
import ModalClose from "../../components/ModalClose";
import KeyboardAvoider from "../../components/KeyboardAvoider";
import FlatPicker from "../../components/FlatPicker";

const today = () => new Date().toISOString().slice(0, 10);

export default function MovesScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const L = labelsFor(user);
  const [moves, setMoves] = useState([]);
  const [flats, setFlats] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("move_in");
  const [flatId, setFlatId] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(today());
  const [deposit, setDeposit] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([api.adminMoves(), api.adminListFlats()]);
      setMoves(r.moves || []);
      setFlats(f.flats || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!flatId || !name.trim()) return Alert.alert("Required", `Pick a ${L.unit.toLowerCase()} and enter the resident name.`);
    setBusy(true);
    try {
      await api.adminCreateMove({
        kind,
        flatId,
        residentName: name.trim(),
        phone: phone.trim() || undefined,
        date,
        notes: notes.trim() || undefined,
        depositAmount: deposit ? Number(deposit) : undefined,
      });
      setOpen(false);
      setName("");
      setPhone("");
      setDeposit("");
      setNotes("");
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="swap-horizontal"
        title="Move in / out"
        subtitle="Occupancy register"
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={() => setOpen(true)} style={styles.add}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {moves.length === 0 && <Text style={styles.empty}>No move-in or move-out records yet.</Text>}
        {moves.map((m) => (
          <View key={m.id} style={styles.card}>
            <Text style={[styles.kind, m.kind === "move_out" && { color: "#B42318" }]}>{m.kind === "move_in" ? "MOVE IN" : "MOVE OUT"}</Text>
            <Text style={styles.title}>{m.residentName} · {m.flatNo}</Text>
            <Text style={styles.meta}>{m.date}{m.phone ? ` · ${m.phone}` : ""}{m.depositAmount ? ` · deposit ₹${m.depositAmount}` : ""}</Text>
            {m.notes ? <Text style={styles.notes}>{m.notes}</Text> : null}
          </View>
        ))}
      </ScrollView>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoider style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Log a move</Text>
              <ModalClose light={false} onPress={() => setOpen(false)} />
            </View>
            <View style={styles.kinds}>
              {["move_in", "move_out"].map((k) => (
                <TouchableOpacity key={k} style={[styles.kindBtn, kind === k && styles.kindOn]} onPress={() => setKind(k)}>
                  <Text style={[styles.kindBtnText, kind === k && { color: "#fff" }]}>{k === "move_in" ? "Move in" : "Move out"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <FlatPicker flats={flats} value={flatId} onChange={setFlatId} placeholder={`Select ${L.unit.toLowerCase()}`} />
            <TextInput style={styles.input} placeholder="Resident name" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Phone (optional)" value={phone} onChangeText={setPhone} />
            <TextInput style={styles.input} placeholder="Date YYYY-MM-DD" value={date} onChangeText={setDate} />
            {kind === "move_in" ? <TextInput style={styles.input} placeholder="Security deposit (optional)" value={deposit} onChangeText={setDeposit} keyboardType="numeric" /> : null}
            <TextInput style={styles.input} placeholder="Notes (optional)" value={notes} onChangeText={setNotes} />
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.cancel}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={submit} disabled={busy} style={styles.save}><Text style={{ color: "#fff", fontWeight: "800" }}>{busy ? "Saving…" : "Save"}</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  add: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 24 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10 },
  kind: { color: "#1E7A3D", fontWeight: "800", fontSize: 11, letterSpacing: 0.6 },
  title: { fontWeight: "800", fontSize: 16, color: "#1B2B33", marginTop: 4 },
  meta: { color: "#6B7B85", marginTop: 4 },
  notes: { color: "#48606B", marginTop: 6 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  modalHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  modalTitle: { flex: 1, fontWeight: "800", fontSize: 18 },
  kinds: { flexDirection: "row", gap: 8, marginBottom: 10 },
  kindBtn: { flex: 1, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  kindOn: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  kindBtnText: { fontWeight: "700", color: "#0B6E8F" },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, padding: 12, marginTop: 8, backgroundColor: "#F8FAFB" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 14 },
  cancel: { padding: 10 },
  save: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
});
