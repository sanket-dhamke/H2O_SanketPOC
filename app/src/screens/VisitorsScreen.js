import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Image,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { labelsFor, isPreschool } from "../lib/org";
import ScreenHeader from "../components/ScreenHeader";

function timeAt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

const STATUS_META = {
  pending: { label: "Waiting", color: "#C2571A", bg: "#FCEEE2" },
  approved: { label: "Approved", color: "#2E9E52", bg: "#E3F5E8" },
  rejected: { label: "Rejected", color: "#C0392B", bg: "#FBE7E4" },
  leave_at_gate: { label: "Left at gate", color: "#7A5AC2", bg: "#EEE8FA" },
};

export default function VisitorsScreen() {
  const { user } = useAuth();
  const [visitors, setVisitors] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { visitors } = await api.visitors();
      setVisitors(visitors);
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

  const decide = async (visitor, status) => {
    try {
      await api.decideVisitor(visitor.id, status);
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const markExit = async (visitor) => {
    try {
      await api.markVisitorExit(visitor.id);
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const L = labelsFor(user);
  const preschool = isPreschool(user);
  const isResident = user.role === "resident";
  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="people"
        title={isResident ? L.visitors : L.gate}
        subtitle={isResident ? "Approve or review your gate entries" : `All ${preschool ? "preschool" : "society"} gate entries`}
      />
      <FlatList
        data={visitors}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No visitors yet. Pull down to refresh.</Text>
        }
        renderItem={({ item }) => {
          const meta = STATUS_META[item.status] || STATUS_META.pending;
          const isResident = user.role === "resident";
          const canDecide = isResident && item.status === "pending";
          // Preschool: guard/admin can mark a visitor out once they've entered.
          const canExit = preschool && !isResident && !item.exitAt && item.status !== "rejected";
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                {item.photo ? (
                  <Image source={{ uri: item.photo }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>
                      {item.name?.charAt(0)?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.purpose} · {L.unit} {item.flatNo}
                    {item.phone ? ` · ${item.phone}` : ""}
                    {item.vehicleNo ? ` · ${item.vehicleNo}` : ""}
                  </Text>
                  <Text style={styles.time}>
                    {timeAgo(item.createdAt)}
                    {preschool && item.exitAt ? ` · Out at ${timeAt(item.exitAt)}` : ""}
                    {preschool && !item.exitAt && item.status !== "rejected" ? " · Inside" : ""}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>

              {canDecide && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.action, { backgroundColor: "#2E9E52" }]}
                    onPress={() => decide(item, "approved")}
                  >
                    <Text style={styles.actionText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.action, { backgroundColor: "#C0392B" }]}
                    onPress={() => decide(item, "rejected")}
                  >
                    <Text style={styles.actionText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.action, { backgroundColor: "#7A5AC2" }]}
                    onPress={() => decide(item, "leave_at_gate")}
                  >
                    <Text style={styles.actionText}>Leave at gate</Text>
                  </TouchableOpacity>
                </View>
              )}

              {canExit && (
                <TouchableOpacity style={styles.exitBtn} onPress={() => markExit(item)}>
                  <Text style={styles.exitText}>Mark exit</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 40 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#E6EDF0" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#0B6E8F", fontWeight: "800", fontSize: 18 },
  name: { fontSize: 16, fontWeight: "700", color: "#1B2B33" },
  meta: { color: "#6B7B85", marginTop: 2, fontSize: 13 },
  time: { color: "#9AA7B0", marginTop: 3, fontSize: 11 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  action: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  exitBtn: { marginTop: 12, borderWidth: 1, borderColor: "#0B6E8F", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  exitText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
});
