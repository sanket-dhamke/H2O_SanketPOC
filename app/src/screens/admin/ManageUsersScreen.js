import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";

const ROLE_ORDER = ["admin", "guard", "resident"];

export default function ManageUsersScreen({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const ROLE_LABEL = { admin: "Admins", guard: "Guards", resident: L.payers };
  const [users, setUsers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { users } = await api.adminListUsers();
      setUsers(users);
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

  const roleOrder = ROLE_ORDER;
  const sections = roleOrder.map((role) => ({
    title: ROLE_LABEL[role],
    data: users.filter((u) => u.role === role),
  })).filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <ScreenHeader icon="people-circle" title={L.members} subtitle={L.membersSub} />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No accounts yet. Tap "New account".</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.active && styles.cardInactive]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.name} {!item.active && <Text style={styles.inactiveTag}>(disabled)</Text>}
              </Text>
              <Text style={styles.meta}>
                {item.email}
                {item.flatNo ? ` · ${L.unit} ${item.flatNo}` : ""}
                {item.phone ? ` · ${item.phone}` : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={() => toggleActive(item)} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>{item.active ? "Disable" : "Enable"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => remove(item)} style={[styles.smallBtn, styles.deleteBtn]}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
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
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, gap: 8 },
  cardInactive: { opacity: 0.6 },
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
