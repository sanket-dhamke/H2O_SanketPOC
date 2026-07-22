import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { labelsFor, isPreschool } from "../lib/org";
import AdsCarousel from "../components/AdsCarousel";
import ProfileModal from "../components/ProfileModal";

const HERO = {
  resident: require("../../assets/home-resident.png"),
  admin: require("../../assets/home-admin.png"),
  guard: require("../../assets/home-guard.png"),
};

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [totalDue, setTotalDue] = useState(0);
  const [pendingVisitors, setPendingVisitors] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          if (user.role === "resident") {
            const m = await api.maintenance();
            const v = await api.visitors();
            if (!active) return;
            setTotalDue(m.totalDue);
            setPendingVisitors(v.visitors.filter((x) => x.status === "pending").length);
          }
        } catch {}
      })();
      return () => {
        active = false;
      };
    }, [user.role])
  );

  const L = labelsFor(user);
  const roleLabel = { resident: L.payer, admin: L.roleAdmin, guard: "Gate desk" }[user.role];
  const actions = getActions(user.role, L, isPreschool(user));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
    >
      <ImageBackground
        source={HERO[user.role]}
        style={[styles.hero, { height: 210 + insets.top }]}
        imageStyle={styles.heroImg}
      >
        <View style={styles.heroOverlay} />
        <View style={[styles.heroContent, { paddingTop: 26 + insets.top }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcome}>Welcome back</Text>
            <Text style={styles.hi}>Hi, {user.name.split(" ")[0]}</Text>
            <View style={styles.badge}>
              <Ionicons name="location-outline" size={12} color="#fff" />
              <Text style={styles.badgeText}>
                {user.flatNo ? `${L.unit} ${user.flatNo}` : roleLabel}
              </Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setProfileOpen(true)}>
              <Ionicons name="person-circle-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
              <Ionicons name="log-out-outline" size={16} color="#fff" />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>

      <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} />

      <View style={styles.body}>
        {user.role === "resident" && (
          <View style={styles.row}>
            <StatCard
              icon="wallet-outline"
              title="Maintenance due"
              value={`₹${totalDue}`}
              tint="#0B6E8F"
              onPress={() => navigation.navigate("Maintenance")}
            />
            <StatCard
              icon="people-outline"
              title="Pending visitors"
              value={String(pendingVisitors)}
              tint="#C2571A"
              onPress={() => navigation.navigate("Visitors")}
            />
          </View>
        )}

        <Text style={styles.sectionTitle}>{roleLabel}</Text>
        {actions.map((a) => (
          <ActionTile key={a.label} {...a} onPress={() => navigation.navigate(a.route)} />
        ))}

        <AdsCarousel />
      </View>
    </ScrollView>
  );
}

function getActions(role, L, preschool) {
  if (role === "resident") {
    return [
      { label: `Pay ${L.feesShort.toLowerCase()}`, subtitle: "View bills & download receipts", icon: "card-outline", tint: "#0B6E8F", route: "Maintenance" },
      { label: "Visitors at gate", subtitle: "Approve, deny or leave at gate", icon: "people-outline", tint: "#C2571A", route: "Visitors" },
      { label: "Ask the assistant", subtitle: `Get instant answers about your ${L.unit.toLowerCase()}`, icon: "sparkles-outline", tint: "#6D3BD1", route: "Assistant" },
    ];
  }
  if (role === "admin") {
    const admin = [
      { label: "Finances & dues", subtitle: "Balance, collections & reminders", icon: "stats-chart-outline", tint: "#0B6E8F", route: "Finance" },
      { label: L.manageTile, subtitle: L.manageTileSub, icon: "people-circle-outline", tint: "#2E9E52", route: "Members" },
      { label: "Gate log", subtitle: L.gateAdminSub, icon: "shield-checkmark-outline", tint: "#C2571A", route: "Visitors" },
    ];
    if (preschool) {
      admin.splice(2, 0, { label: "Staff attendance", subtitle: "Teacher & staff check-in/out", icon: "id-card-outline", tint: "#7A5AC2", route: "Staff" });
    } else {
      admin.push({ label: "Ask the assistant", subtitle: "Query anything about the society", icon: "sparkles-outline", tint: "#6D3BD1", route: "Assistant" });
    }
    return admin;
  }
  const guard = [
    { label: "Log a new visitor", subtitle: `Photo, ${L.unit.toLowerCase()} & purpose in seconds`, icon: "person-add-outline", tint: "#0B6E8F", route: "Gate" },
    { label: "View gate log", subtitle: "Today's entries & their status", icon: "list-outline", tint: "#C2571A", route: "Visitors" },
    { label: "Ask the assistant", subtitle: "Voice & AI help at the gate", icon: "sparkles-outline", tint: "#6D3BD1", route: "Assistant" },
  ];
  if (preschool) {
    guard.splice(2, 0, { label: "Staff attendance", subtitle: "Teacher & staff check-in/out", icon: "id-card-outline", tint: "#7A5AC2", route: "Staff" });
  }
  return guard;
}

function StatCard({ icon, title, value, tint, onPress }) {
  return (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.statIcon, { backgroundColor: tint + "1A" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

function ActionTile({ label, subtitle, icon, tint, onPress }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.tileIcon, { backgroundColor: tint + "1A" }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileLabel}>{label}</Text>
        <Text style={styles.tileSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#B7C2C9" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },

  hero: { height: 210, justifyContent: "flex-start" },
  heroImg: { resizeMode: "cover" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6, 40, 52, 0.45)" },
  heroContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 26,
  },
  welcome: { color: "#DCEDF3", fontSize: 13, fontWeight: "600" },
  hi: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  logoutText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  body: { paddingHorizontal: 20, paddingTop: 20 },
  // Only the resident stat cards pull up to overlap the hero; other roles keep
  // normal spacing so their section title isn't clipped by the hero.
  row: { flexDirection: "row", gap: 14, marginTop: -44 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statValue: { fontSize: 24, fontWeight: "800", color: "#1B2B33" },
  statTitle: { color: "#6B7B85", marginTop: 2, fontSize: 12 },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 24, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tileIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontSize: 16, fontWeight: "700", color: "#1B2B33" },
  tileSub: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
});
