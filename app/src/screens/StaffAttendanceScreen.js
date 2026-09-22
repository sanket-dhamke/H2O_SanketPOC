import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isPreschool } from "../lib/org";
import { openScreen } from "../lib/nav";
import ScreenHeader from "../components/ScreenHeader";

// Two kinds of people come through the gate every day and neither is a visitor:
//   Staff   — the society's or school's own people (security, housekeeping,
//             teachers). Logged by name, no standing record needed.
//   Helpers — registered maids, cooks, drivers and vendors who carry a portable
//             identity (Worker), so their attendance follows them between
//             societies and feeds their Trust Passport.
const PRESCHOOL_ROLES = ["Teacher", "Helper", "Security", "Admin", "Other"];
const SOCIETY_ROLES = ["Security", "Housekeeping", "Gardener", "Technician", "Office", "Other"];

const timeAt = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

export default function StaffAttendanceScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const preschool = isPreschool(user);
  const roles = preschool ? PRESCHOOL_ROLES : SOCIETY_ROLES;

  const [tab, setTab] = useState("staff");
  const [staff, setStaff] = useState({ records: [], onPremise: 0, total: 0 });
  const [helpers, setHelpers] = useState({ records: [], onPremise: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const [name, setName] = useState("");
  const [role, setRole] = useState(roles[0]);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    const [s, h] = await Promise.all([
      api.staffAttendance().catch((e) => {
        Alert.alert("Error", e.message);
        return null;
      }),
      api.workerAttendanceToday().catch(() => null),
    ]);
    if (s) setStaff(s);
    if (h) setHelpers(h);
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

  const checkInStaff = async () => {
    if (!name.trim()) {
      Alert.alert("Missing info", `Enter the ${preschool ? "staff member's" : "staff member's"} name.`);
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

  const checkOutStaff = async (rec) => {
    try {
      await api.staffCheckOut(rec.id);
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const search = async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await api.workers({ query: q });
      setResults(r.workers || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSearching(false);
    }
  };

  // Ids already inside, so a second tap says "already in" instead of silently
  // re-using the open row the API returns.
  const insideIds = useMemo(
    () => new Set(helpers.records.filter((r) => !r.outAt).map((r) => r.workerId)),
    [helpers.records]
  );

  const checkInHelper = async (worker) => {
    if (insideIds.has(worker.id)) {
      Alert.alert("Already inside", `${worker.name} is already checked in today.`);
      return;
    }
    setBusy(true);
    try {
      const r = await api.workerCheckIn(worker.id);
      setQuery("");
      setResults([]);
      await load();
      if (r?.alreadyIn) Alert.alert("Already inside", `${worker.name} was already checked in.`);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const checkOutHelper = async (rec) => {
    try {
      await api.workerCheckOut(rec.id);
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const staffTab = tab === "staff";
  const rows = staffTab ? staff.records : helpers.records;

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="id-card"
        title="Staff & helpers"
        subtitle={`${staff.onPremise + helpers.onPremise} on premise · ${staff.total + helpers.total} today`}
      />

      <View style={styles.segment}>
        <Seg
          label={`${preschool ? "Staff" : "Society staff"}${staff.onPremise ? ` (${staff.onPremise})` : ""}`}
          active={staffTab}
          onPress={() => setTab("staff")}
        />
        <Seg
          label={`Helpers${helpers.onPremise ? ` (${helpers.onPremise})` : ""}`}
          active={!staffTab}
          onPress={() => setTab("helpers")}
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          staffTab ? (
            <View style={styles.form}>
              <Text style={styles.formTitle}>Check in staff</Text>
              <Text style={styles.formHint}>
                {preschool
                  ? "Teachers, helpers and office staff."
                  : "The society's own people — security, housekeeping, gardeners, technicians."}
              </Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Staff name" />
              <View style={styles.roleRow}>
                {roles.map((r) => (
                  <TouchableOpacity key={r} style={[styles.roleChip, role === r && styles.roleChipActive]} onPress={() => setRole(r)}>
                    <Text style={[styles.roleText, role === r && { color: "#fff" }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone (optional)" keyboardType="phone-pad" />
              <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={checkInStaff} disabled={busy}>
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{busy ? "Saving…" : "Check in"}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.formTitle}>Check in a helper</Text>
              <Text style={styles.formHint}>
                Maids, cooks, drivers and vendors. Search by name or phone — their rating and attendance follow them across societies.
              </Text>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color="#8895A0" />
                <TextInput
                  style={styles.search}
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={search}
                  returnKeyType="search"
                  placeholder="Name or phone"
                />
                <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={searching}>
                  <Text style={styles.searchBtnText}>{searching ? "…" : "Find"}</Text>
                </TouchableOpacity>
              </View>

              {results.map((w) => {
                const inside = insideIds.has(w.id);
                return (
                  <View key={w.id} style={styles.resultRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{w.name}</Text>
                      <Text style={styles.meta}>
                        {w.subtype || w.category || "Helper"}
                        {w.phone ? ` · ${w.phone}` : ""}
                        {w.reviewCount ? ` · ★ ${w.rating} (${w.reviewCount})` : ""}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.inBtn, (inside || busy) && { opacity: 0.5 }]}
                      onPress={() => checkInHelper(w)}
                      disabled={inside || busy}
                    >
                      <Text style={styles.inBtnText}>{inside ? "Inside" : "Check in"}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {query.trim() && !searching && results.length === 0 ? (
                <Text style={styles.searchEmpty}>No helper matches “{query.trim()}”.</Text>
              ) : null}

              <TouchableOpacity
                style={styles.registerLink}
                onPress={() => openScreen(navigation, "Community", { screen: "Workers" })}
              >
                <Ionicons name="person-add-outline" size={16} color="#0B6E8F" />
                <Text style={styles.registerLinkText}>New helper? Register them first</Text>
                <Ionicons name="chevron-forward" size={16} color="#0B6E8F" />
              </TouchableOpacity>
            </View>
          )
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {staffTab ? "No staff checked in today." : "No helpers checked in today."}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {staffTab ? item.role || "Staff" : item.subtype || item.category || "Helper"}
                {!staffTab && item.flatNo ? ` · ${item.flatNo}` : ""}
                {` · In ${timeAt(item.inAt)}`}
                {item.outAt ? ` · Out ${timeAt(item.outAt)}` : ""}
              </Text>
            </View>
            {item.outAt ? (
              <View style={styles.doneBadge}>
                <Text style={styles.doneText}>Left</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.outBtn}
                onPress={() => (staffTab ? checkOutStaff(item) : checkOutHelper(item))}
              >
                <Text style={styles.outText}>Check out</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

function Seg({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.seg, active && styles.segActive]} onPress={onPress}>
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  segment: { flexDirection: "row", backgroundColor: "#fff", margin: 16, marginBottom: 0, borderRadius: 12, padding: 4 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segActive: { backgroundColor: "#0B6E8F" },
  segText: { color: "#6B7B85", fontWeight: "700", fontSize: 13 },
  segTextActive: { color: "#fff" },
  form: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 14 },
  formTitle: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  formHint: { fontSize: 12.5, color: "#6B7B85", lineHeight: 18, marginTop: 4, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB", marginBottom: 10 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  roleChip: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  roleChipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  roleText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13 },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#D6DEE3", backgroundColor: "#F8FAFB", borderRadius: 10, paddingHorizontal: 12 },
  search: { flex: 1, paddingVertical: 11, fontSize: 15 },
  searchBtn: { backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchEmpty: { color: "#8895A0", fontSize: 12.5, marginTop: 10 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "#EDF2F4", paddingTop: 12, marginTop: 12 },
  inBtn: { backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  inBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  registerLink: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EAF4F8", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  registerLinkText: { flex: 1, color: "#0B3A49", fontWeight: "700", fontSize: 12.5 },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 20 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 10 },
  name: { fontSize: 16, fontWeight: "700", color: "#1B2B33" },
  meta: { color: "#6B7B85", marginTop: 2, fontSize: 13 },
  outBtn: { borderWidth: 1, borderColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  outText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  doneBadge: { backgroundColor: "#EEF2F4", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  doneText: { color: "#8895A0", fontWeight: "700", fontSize: 13 },
});
