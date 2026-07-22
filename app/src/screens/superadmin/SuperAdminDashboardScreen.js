import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import ScreenHeader from "../../components/ScreenHeader";
import ProfileModal from "../../components/ProfileModal";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

export default function SuperAdminDashboardScreen() {
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.superOverview());
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

  const headerBtns = (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <TouchableOpacity onPress={() => setProfileOpen(true)} style={styles.logoutBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="person-circle-outline" size={24} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={logout} style={styles.logoutBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="log-out-outline" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="planet"
        title="H2O Platform"
        subtitle="Owner overview across all societies"
        right={headerBtns}
      />
      <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Societies using H2O</Text>
          <Text style={styles.heroValue}>{data?.societies ?? "—"}</Text>
          <Text style={styles.heroSub}>{data?.activeSocieties ?? 0} active</Text>
        </View>

        <View style={styles.grid}>
          <Metric icon="business" label="Flats" value={data?.flats ?? 0} color="#0B6E8F" />
          <Metric icon="people" label="Residents" value={data?.residents ?? 0} color="#2E9E52" />
          <Metric icon="shield-checkmark" label="Guards" value={data?.guards ?? 0} color="#7A5AF8" />
          <Metric icon="briefcase" label="Admins" value={data?.admins ?? 0} color="#C2571A" />
        </View>

        <Text style={styles.sectionTitle}>H2O revenue</Text>
        <View style={styles.revenueCard}>
          <View style={styles.revenueTop}>
            <View>
              <Text style={styles.revenueLabel}>Total H2O revenue</Text>
              <Text style={styles.revenueValue}>{money(data?.revenue?.total)}</Text>
            </View>
            <View style={styles.premiumPill}>
              <Ionicons name="star" size={13} color="#8A5A00" />
              <Text style={styles.premiumPillText}>{data?.premiumSocieties ?? 0} premium</Text>
            </View>
          </View>
          <View style={styles.revenueSplit}>
            <View style={styles.revenueSplitBox}>
              <Text style={styles.revenueSplitLabel}>Subscriptions</Text>
              <Text style={styles.revenueSplitVal}>{money(data?.revenue?.subscriptions)}</Text>
            </View>
            <View style={styles.revenueSplitBox}>
              <Text style={styles.revenueSplitLabel}>Vendor fees (10%)</Text>
              <Text style={styles.revenueSplitVal}>{money(data?.revenue?.platformFees)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Platform finances</Text>
        <View style={styles.finRow}>
          <Fin label="Collected" value={money(data?.collected)} color="#2E9E52" />
          <Fin label="Pending" value={money(data?.pending)} color="#C2571A" />
        </View>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Net balance (all societies)</Text>
          <Text style={styles.balanceValue}>{money(data?.balance)}</Text>
          <Text style={styles.balanceSub}>Expenses {money(data?.expenses)}</Text>
        </View>

        {!!data?.topPending?.length && (
          <>
            <Text style={styles.sectionTitle}>Highest outstanding dues</Text>
            {data.topPending
              .filter((s) => s.pending > 0)
              .map((s) => (
                <View key={s.id} style={styles.dueRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dueName}>{s.name}</Text>
                    <Text style={styles.dueCity}>{s.city || "—"}</Text>
                  </View>
                  <Text style={styles.dueAmt}>{money(s.pending)}</Text>
                </View>
              ))}
            {data.topPending.filter((s) => s.pending > 0).length === 0 && (
              <Text style={styles.allClear}>No outstanding dues anywhere. 🎉</Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({ icon, label, value, color }) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Fin({ label, value, color }) {
  return (
    <View style={[styles.fin, { borderTopColor: color }]}>
      <Text style={styles.finValue}>{value}</Text>
      <Text style={styles.finLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  logoutBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  heroCard: { backgroundColor: "#0B6E8F", borderRadius: 16, padding: 22 },
  heroLabel: { color: "#CDE9F2", fontSize: 13 },
  heroValue: { color: "#fff", fontSize: 40, fontWeight: "800", marginTop: 2 },
  heroSub: { color: "#CDE9F2", fontSize: 12, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  metric: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
  },
  metricIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  metricValue: { fontSize: 24, fontWeight: "800", color: "#1B2B33", marginTop: 10 },
  metricLabel: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1B2B33", marginTop: 26, marginBottom: 10 },
  revenueCard: { backgroundColor: "#fff", borderRadius: 16, padding: 18, borderLeftWidth: 4, borderLeftColor: "#E0A83E" },
  revenueTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  revenueLabel: { color: "#6B7B85", fontSize: 13 },
  revenueValue: { color: "#1B2B33", fontSize: 28, fontWeight: "800", marginTop: 2 },
  premiumPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FDF0D0", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  premiumPillText: { color: "#8A5A00", fontWeight: "700", fontSize: 12 },
  revenueSplit: { flexDirection: "row", gap: 12, marginTop: 14 },
  revenueSplitBox: { flex: 1, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 12 },
  revenueSplitLabel: { color: "#6B7B85", fontSize: 11 },
  revenueSplitVal: { color: "#1B2B33", fontSize: 16, fontWeight: "800", marginTop: 3 },
  finRow: { flexDirection: "row", gap: 12 },
  fin: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 16, borderTopWidth: 4 },
  finValue: { fontSize: 20, fontWeight: "800", color: "#1B2B33" },
  finLabel: { color: "#6B7B85", marginTop: 4, fontSize: 12 },
  balanceCard: { backgroundColor: "#12303B", borderRadius: 16, padding: 20, marginTop: 12 },
  balanceLabel: { color: "#9FC3D0", fontSize: 13 },
  balanceValue: { color: "#fff", fontSize: 30, fontWeight: "800", marginTop: 4 },
  balanceSub: { color: "#9FC3D0", fontSize: 12, marginTop: 6 },
  dueRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8 },
  dueName: { fontWeight: "700", color: "#1B2B33" },
  dueCity: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
  dueAmt: { color: "#C2571A", fontWeight: "800" },
  allClear: { color: "#6B7B85", textAlign: "center", marginTop: 8 },
});
