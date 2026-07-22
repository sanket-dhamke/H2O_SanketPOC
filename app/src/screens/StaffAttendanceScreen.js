import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import ScreenHeader from "../components/ScreenHeader";

const ROLES = ["Teacher", "Helper", "Security", "Admin", "Other"];
const timeAt = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

export default function StaffAttendanceScreen() {
  const [data, setData] = useState({ records: [], onPremise: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Teacher");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.staffAttendance());
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

  const checkIn = async () => {
    if (!name.trim()) {
      Alert.alert("Missing info", "Enter the staff member's name.");
      return;
    }
    setBusy(true);
    try {
      await api.staffCheckIn({ name: name.trim(), role, phone: phone.trim() || undefined });
      setName("");
      setPhone("");
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async (rec) => {
    try {
      await api.staffCheckOut(rec.id);
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="id-card"
        title="Staff attendance"
        subtitle={`${data.onPremise} on premise · ${data.total} today`}
      />
      <FlatList
        data={data.records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.form}>
            <Text style={styles.formTitle}>Check in staff</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Staff name" />
            <View style={styles.roleRow}>
              {ROLES.map((r) => (
                <TouchableOpacity key={r} style={[styles.roleChip, role === r && styles.roleChipActive]} onPress={() => setRole(r)}>
                  <Text style={[styles.roleText, role === r && { color: "#fff" }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone (optional)" keyboardType="phone-pad" />
            <TouchableOpacity style={[styles.checkInBtn, busy && { opacity: 0.6 }]} onPress={checkIn} disabled={busy}>
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.checkInText}>{busy ? "Saving…" : "Check in"}</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>No staff checked in today.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.role || "Staff"} · In {timeAt(item.inAt)}
                {item.outAt ? ` · Out ${timeAt(item.outAt)}` : ""}
              </Text>
            </View>
            {item.outAt ? (
              <View style={styles.doneBadge}>
                <Text style={styles.doneText}>Left</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.outBtn} onPress={() => checkOut(item)}>
                <Text style={styles.outText}>Check out</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  form: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 14 },
  formTitle: { fontSize: 16, fontWeight: "800", color: "#1B2B33", marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB", marginBottom: 10 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  roleChip: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  roleChipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  roleText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  checkInBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13 },
  checkInText: { color: "#fff", fontWeight: "800" },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 20 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 10 },
  name: { fontSize: 16, fontWeight: "700", color: "#1B2B33" },
  meta: { color: "#6B7B85", marginTop: 2, fontSize: 13 },
  outBtn: { borderWidth: 1, borderColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  outText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  doneBadge: { backgroundColor: "#EEF2F4", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  doneText: { color: "#8895A0", fontWeight: "700", fontSize: 13 },
});
