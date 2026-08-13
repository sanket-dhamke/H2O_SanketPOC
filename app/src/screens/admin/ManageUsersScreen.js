import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor, isPreschool } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";

const ROLE_ORDER = ["admin", "guard", "resident"];

export default function ManageUsersScreen({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const preschool = isPreschool(user);
  const ROLE_LABEL = { admin: "Admins", guard: "Guards", resident: L.payers };
  const [users, setUsers] = useState([]);
  const [joinCode, setJoinCode] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ users }, codeRes] = await Promise.all([
        api.adminListUsers(),
        api.adminJoinCode().catch(() => ({ joinCode: null })),
      ]);
      setUsers(users);
      setJoinCode(codeRes?.joinCode || null);
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

  const toggleActive = async (u) => {
    try {
      await api.adminUpdateUser(u.id, { active: !u.active });
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const approve = async (u) => {
    try {
      await api.adminApproveUser(u.id);
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const shareJoinCode = async () => {
    if (!joinCode) return;
    const noun = preschool ? "parents" : "residents";
    try {
      await Share.share({
        message:
          `Join our ${preschool ? "preschool" : "society"} on GateMate.\n\n` +
          `1. Install GateMate\n2. Tap "New resident? Register with a join code"\n` +
          `3. Enter join code: ${joinCode}\n4. Enter your ${L.unit.toLowerCase()} number and set a password.\n\n` +
          `An admin will approve your account. (Share this only with your ${noun}.)`,
      });
    } catch {}
  };

  const rotateJoinCode = () => {
    Alert.alert(
      "Generate a new code?",
      "The current code will stop working immediately. Anyone you've already shared it with will need the new one.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate new",
          style: "destructive",
          onPress: async () => {
            try {
              const { joinCode } = await api.adminRotateJoinCode();
              setJoinCode(joinCode);
            } catch (e) {
              Alert.alert("Error", e.message);
            }
          },
        },
      ]
    );
  };

  const remove = (u) => {
    Alert.alert("Delete account", `Remove ${u.name} (${u.email})?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.adminDeleteUser(u.id);
            await load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const pending = users.filter((u) => u.pendingApproval);
  const roleOrder = ROLE_ORDER;
  const sections = [
    ...(pending.length ? [{ title: "Pending approval", data: pending, pending: true }] : []),
    ...roleOrder.map((role) => ({
      title: ROLE_LABEL[role],
      data: users.filter((u) => u.role === role && !u.pendingApproval),
    })),
  ].filter((s) => s.data.length > 0);

  const JoinCodeHeader = () => (
    <View style={styles.joinCard}>
      <View style={styles.joinTop}>
        <Ionicons name="qr-code-outline" size={18} color="#0B6E8F" />
        <Text style={styles.joinTitle}>Self-registration code</Text>
      </View>
      <Text style={styles.joinSub}>
        Share this code so {preschool ? "parents" : "residents"} can register themselves. Each new
        account waits here for your approval.
      </Text>
      <View style={styles.joinCodeRow}>
        <Text style={styles.joinCode}>{joinCode || "…"}</Text>
      </View>
      <View style={styles.joinBtns}>
        <TouchableOpacity style={styles.joinBtn} onPress={shareJoinCode} disabled={!joinCode}>
          <Ionicons name="share-social-outline" size={16} color="#fff" />
          <Text style={styles.joinBtnText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.joinBtn, styles.joinBtnGhost]} onPress={rotateJoinCode} disabled={!joinCode}>
          <Ionicons name="refresh" size={16} color="#0B6E8F" />
          <Text style={styles.joinBtnGhostText}>New code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader icon="people-circle" title={L.members} subtitle={L.membersSub} />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={<JoinCodeHeader />}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionHeader, section.pending && styles.pendingHeader]}>
            {section.title}
            {section.pending ? ` (${section.data.length})` : ""}
          </Text>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No accounts yet. Tap "New account".</Text>}
        renderItem={({ item, section }) => (
          <View style={[styles.card, !item.active && styles.cardInactive, section.pending && styles.pendingCard]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.name} {!item.active && !section.pending && <Text style={styles.inactiveTag}>(disabled)</Text>}
              </Text>
              <Text style={styles.meta}>
                {item.email}
                {item.flatNo ? ` · ${L.unit} ${item.flatNo}` : ""}
                {item.phone ? ` · ${item.phone}` : ""}
              </Text>
            </View>
            {section.pending ? (
              <>
                <TouchableOpacity onPress={() => approve(item)} style={[styles.smallBtn, styles.approveBtn]}>
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(item)} style={[styles.smallBtn, styles.deleteBtn]}>
                  <Text style={styles.deleteText}>Reject</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => toggleActive(item)} style={styles.smallBtn}>
                  <Text style={styles.smallBtnText}>{item.active ? "Disable" : "Enable"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(item)} style={[styles.smallBtn, styles.deleteBtn]}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      />

      <View style={styles.fabRow}>
        <TouchableOpacity style={styles.secondaryFab} onPress={() => navigation.navigate("BankAccount")}>
          <Text style={styles.secondaryFabText}>Bank</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryFab} onPress={() => navigation.navigate("ManageFlats")}>
          <Text style={styles.secondaryFabText}>{L.units}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("CreateAccount")}>
          <Text style={styles.fabText}>+ New account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  sectionHeader: { fontSize: 13, fontWeight: "800", color: "#6B7B85", textTransform: "uppercase", marginTop: 16, marginBottom: 8 },
  pendingHeader: { color: "#B0803A" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, gap: 8 },
  cardInactive: { opacity: 0.6 },
  pendingCard: { borderWidth: 1, borderColor: "#F0D9A8", backgroundColor: "#FFFBF2" },
  joinCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 4 },
  joinTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  joinTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33" },
  joinSub: { color: "#6B7B85", fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  joinCodeRow: { backgroundColor: "#EAF4F7", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  joinCode: { fontSize: 24, fontWeight: "800", color: "#0B6E8F", letterSpacing: 3 },
  joinBtns: { flexDirection: "row", gap: 10, marginTop: 12 },
  joinBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 11 },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  joinBtnGhost: { backgroundColor: "#EEF4F6" },
  joinBtnGhostText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  approveBtn: { backgroundColor: "#E3F5E8" },
  approveText: { color: "#2E9E52", fontWeight: "700", fontSize: 12 },
  name: { fontSize: 15, fontWeight: "700", color: "#1B2B33" },
  inactiveTag: { color: "#C0392B", fontSize: 12, fontWeight: "600" },
  meta: { color: "#6B7B85", marginTop: 2, fontSize: 12 },
  smallBtn: { backgroundColor: "#EEF2F4", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  smallBtnText: { color: "#0B6E8F", fontWeight: "700", fontSize: 12 },
  deleteBtn: { backgroundColor: "#FBE7E4" },
  deleteText: { color: "#C0392B", fontWeight: "700", fontSize: 12 },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 40 },
  fabRow: { position: "absolute", right: 16, bottom: 16, flexDirection: "row", gap: 10 },
  fab: { backgroundColor: "#0B6E8F", paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, elevation: 3 },
  fabText: { color: "#fff", fontWeight: "800" },
  secondaryFab: { backgroundColor: "#fff", paddingHorizontal: 18, paddingVertical: 14, borderRadius: 30, elevation: 2 },
  secondaryFabText: { color: "#0B6E8F", fontWeight: "800" },
});
