import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { brand } from "../lib/brand";
import ScreenHeader from "../components/ScreenHeader";
import KeyboardAwareScrollView from "../components/KeyboardAwareScrollView";

export default function PickupScreen() {
  const navigation = useNavigation();
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null); // { authorization, valid, student }
  const [busy, setBusy] = useState(false);
  const [logging, setLogging] = useState(false);

  const verify = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.verifyPickup(c);
      setResult(r);
    } catch (e) {
      Alert.alert("Not found", e.message);
    } finally {
      setBusy(false);
    }
  };

  const log = async (kind) => {
    if (!result?.authorization) return;
    setLogging(true);
    try {
      await api.logPickup({
        flatId: result.authorization.flatId,
        authorizationId: result.authorization.id,
        personName: result.authorization.name,
        personPhone: result.authorization.phone,
        relation: result.authorization.relation,
        kind,
      });
      Alert.alert("Logged", `${kind === "drop" ? "Drop-off" : "Pickup"} recorded. The parent has been notified.`);
      setResult(null);
      setCode("");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLogging(false);
    }
  };

  const a = result?.authorization;
  const student = result?.student;

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="qr-code"
        title="Child pickup"
        subtitle="Verify the pass, then log pickup/drop"
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
      />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.label}>Pickup pass code</Text>
        <View style={styles.codeRow}>
          <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="e.g. PU1A2B3C4D" autoCapitalize="characters" autoCorrect={false} />
          <TouchableOpacity style={[styles.verifyBtn, busy && { opacity: 0.6 }]} onPress={verify} disabled={busy}>
            <Text style={styles.verifyText}>{busy ? "…" : "Verify"}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Ask the parent/guardian to show their pickup QR from the {brand.name} app. Type the code under it.</Text>

        {result && (
          <View style={styles.resultCard}>
            <View style={[styles.badge, { backgroundColor: result.valid ? "#EAF7EF" : "#FDECEC" }]}>
              <Ionicons name={result.valid ? "shield-checkmark" : "warning"} size={16} color={result.valid ? "#1E7A3D" : "#B42318"} />
              <Text style={[styles.badgeText, { color: result.valid ? "#1E7A3D" : "#B42318" }]}>
                {result.valid ? "Authorized" : "Pass not valid — do not release"}
              </Text>
            </View>
            <View style={styles.personRow}>
              <View style={styles.avatar}>
                {a?.photoUrl ? <Image source={{ uri: a.photoUrl }} style={styles.avatarImg} /> : <Ionicons name="person" size={26} color="#0B6E8F" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{a?.name}</Text>
                <Text style={styles.personSub}>{[a?.relation, a?.phone].filter(Boolean).join(" · ")}</Text>
              </View>
            </View>
            <View style={styles.studentBox}>
              <Ionicons name="school" size={16} color="#6D3BD1" />
              <Text style={styles.studentText}>
                Student: {student?.block ? `${student.block} · ` : ""}{student?.flatNo}
                {student?.guardianName ? ` (${student.guardianName})` : ""}
              </Text>
            </View>
            {result.valid && (
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.actBtn, { backgroundColor: "#C2571A" }, logging && { opacity: 0.6 }]} onPress={() => log("pickup")} disabled={logging}>
                  <Ionicons name="log-out-outline" size={18} color="#fff" />
                  <Text style={styles.actText}>Log pickup</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actBtn, { backgroundColor: "#2E9E52" }, logging && { opacity: 0.6 }]} onPress={() => log("drop")} disabled={logging}>
                  <Ionicons name="log-in-outline" size={18} color="#fff" />
                  <Text style={styles.actText}>Log drop-off</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  label: { fontSize: 13, fontWeight: "700", color: "#334", marginBottom: 8 },
  codeRow: { flexDirection: "row", gap: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, backgroundColor: "#fff" },
  verifyBtn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  verifyText: { color: "#fff", fontWeight: "800" },
  hint: { color: "#8895A0", fontSize: 12.5, marginTop: 10, lineHeight: 18 },
  resultCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginTop: 20 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontWeight: "800", fontSize: 12.5 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  avatar: { width: 54, height: 54, borderRadius: 16, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 54, height: 54 },
  personName: { fontSize: 17, fontWeight: "800", color: "#1B2B33" },
  personSub: { color: "#6B7B85", fontSize: 13, marginTop: 2 },
  studentBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F5F1FE", borderRadius: 10, padding: 12, marginTop: 14 },
  studentText: { color: "#4B2A9E", fontWeight: "700", fontSize: 13.5, flex: 1 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 14 },
  actText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
