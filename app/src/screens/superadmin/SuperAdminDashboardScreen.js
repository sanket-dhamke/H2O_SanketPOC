import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import ScreenHeader from "../../components/ScreenHeader";
import ProfileModal from "../../components/ProfileModal";
import MonthField from "../../components/MonthField";
import MarketplaceModerationModal from "./MarketplaceModerationModal";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function prettyMonth(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return "";
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

// Config for each tappable tile: which per-society field to break down + how to
// render each value. Counts show as-is; money fields format as rupees.
const BREAKDOWNS = {
  flats: { title: "Flats", field: "flats", icon: "business", color: "#0B6E8F", money: false },
  residents: { title: "Residents", field: "residents", icon: "people", color: "#2E9E52", money: false },
  guards: { title: "Guards", field: "guards", icon: "shield-checkmark", color: "#7A5AF8", money: false },
  admins: { title: "Admins", field: "admins", icon: "briefcase", color: "#C2571A", money: false },
  collected: { title: "Collected", field: "collected", icon: "cash", color: "#2E9E52", money: true },
  pending: { title: "Pending dues", field: "pending", icon: "alert-circle", color: "#C2571A", money: true },
};

export default function SuperAdminDashboardScreen() {
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [breakdown, setBreakdown] = useState(null); // key into BREAKDOWNS
  const [period, setPeriod] = useState(""); // "YYYY-MM" month filter for the snapshot
  const [monthBreakdown, setMonthBreakdown] = useState(null); // "collected" | "pending"

  const load = useCallback(async (selectedPeriod) => {
    try {
      const [overview, list] = await Promise.all([
        api.superOverview(selectedPeriod || undefined),
        api.superListSocieties(),
      ]);
      setData(overview);
      setRows(list.societies || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [load, period])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(period);
    setRefreshing(false);
  };

  const month = data?.month || null;

  const headerBtns = (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <TouchableOpacity onPress={() => setModerationOpen(true)} style={styles.logoutBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="pricetags-outline" size={22} color="#fff" />
      </TouchableOpacity>
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
        logo={require("../../../assets/icon.png")}
        title="GateMate Platform"
        subtitle="Overview of all societies"
        right={headerBtns}
      />
      <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} />
      <MarketplaceModerationModal visible={moderationOpen} onClose={() => setModerationOpen(false)} />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Societies using GateMate</Text>
          <Text style={styles.heroValue}>{data?.societies ?? "—"}</Text>
          <Text style={styles.heroSub}>{data?.activeSocieties ?? 0} active</Text>
        </View>

        <TouchableOpacity style={styles.moderateCard} activeOpacity={0.85} onPress={() => setModerationOpen(true)}>
          <View style={styles.moderateIcon}>
            <Ionicons name="pricetags" size={18} color="#B0620B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.moderateTitle}>Moderate Buy &amp; Sell</Text>
            <Text style={styles.moderateSub}>Review, disable or delete posts across all societies</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9AA7AF" />
        </TouchableOpacity>

        <View style={styles.monthPickerRow}>
          <Ionicons name="calendar-outline" size={16} color="#0B6E8F" />
          <Text style={styles.monthPickerLabel}>Snapshot for</Text>
          <View style={{ flex: 1 }}>
            <MonthField value={period} onChange={setPeriod} placeholder="All time" />
          </View>
        </View>

        {period && month && (
          <View style={styles.monthCard}>
            <View style={styles.monthCardHead}>
              <Ionicons name="stats-chart" size={16} color="#0B6E8F" />
              <Text style={styles.monthCardTitle}>For {prettyMonth(month.period)}</Text>
            </View>
            <View style={styles.monthGrid}>
              <MonthTile
                label="Collected"
                value={money(month.collected)}
                hint="received this month"
                color="#2E9E52"
                onPress={() => setMonthBreakdown("collected")}
              />
              <MonthTile
                label="Pending"
                value={money(month.pending)}
                hint="unpaid for this month"
                color="#C2571A"
                onPress={() => setMonthBreakdown("pending")}
              />
              <MonthTile label="Billed" value={money(month.billed)} hint="issued for this month" color="#0B6E8F" />
              <MonthTile
                label="New tenants"
                value={String(month.newSocieties ?? 0)}
                hint="onboarded this month"
                color="#7A5AF8"
              />
            </View>
            <View style={styles.monthRevenue}>
              <Text style={styles.monthRevenueLabel}>GateMate revenue this month</Text>
              <Text style={styles.monthRevenueValue}>{money(month.revenue?.total)}</Text>
              <Text style={styles.monthRevenueSub}>
                Subscriptions {money(month.revenue?.subscriptions)} · Vendor fees {money(month.revenue?.platformFees)}
              </Text>
            </View>
            <Text style={styles.monthTapHint}>Tap Collected or Pending to see the per-society breakdown.</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>All-time totals</Text>
        <View style={styles.grid}>
          <Metric icon="business" label="Flats" value={data?.flats ?? 0} color="#0B6E8F" onPress={() => setBreakdown("flats")} />
          <Metric icon="people" label="Residents" value={data?.residents ?? 0} color="#2E9E52" onPress={() => setBreakdown("residents")} />
          <Metric icon="shield-checkmark" label="Guards" value={data?.guards ?? 0} color="#7A5AF8" onPress={() => setBreakdown("guards")} />
          <Metric icon="briefcase" label="Admins" value={data?.admins ?? 0} color="#C2571A" onPress={() => setBreakdown("admins")} />
        </View>
        <Text style={styles.tapHint}>Tap any card to see the breakdown by society.</Text>

        <Text style={styles.sectionTitle}>GateMate revenue</Text>
        <View style={styles.revenueCard}>
          <View style={styles.revenueTop}>
            <View>
              <Text style={styles.revenueLabel}>Total GateMate revenue</Text>
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
          <Fin label="Collected" value={money(data?.collected)} color="#2E9E52" onPress={() => setBreakdown("collected")} />
          <Fin label="Pending" value={money(data?.pending)} color="#C2571A" onPress={() => setBreakdown("pending")} />
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
      <BreakdownModal
        config={breakdown ? BREAKDOWNS[breakdown] : null}
        rows={rows}
        onClose={() => setBreakdown(null)}
      />
      <MonthBreakdownModal
        field={monthBreakdown}
        monthLabel={prettyMonth(month?.period)}
        rows={month?.bySociety || []}
        onClose={() => setMonthBreakdown(null)}
      />
    </View>
  );
}

function MonthTile({ label, value, hint, color, onPress }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={styles.monthTile} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.monthTileValue, { color }]}>{value}</Text>
      <Text style={styles.monthTileLabel}>{label}</Text>
      <Text style={styles.monthTileHint}>{hint}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={13} color="#B7C1C8" style={styles.monthTileChevron} /> : null}
    </Wrap>
  );
}

// Per-society breakdown of the selected month's collected or pending amount.
function MonthBreakdownModal({ field, monthLabel, rows, onClose }) {
  if (!field) return null;
  const isCollected = field === "collected";
  const title = isCollected ? "Collected" : "Pending";
  const color = isCollected ? "#2E9E52" : "#C2571A";
  const list = [...rows].filter((r) => (r[field] || 0) > 0).sort((a, b) => (b[field] || 0) - (a[field] || 0));
  const total = rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name={isCollected ? "cash" : "alert-circle"} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{title} · {monthLabel}</Text>
              <Text style={styles.modalSub}>Total: {money(total)} across {list.length} tenant{list.length === 1 ? "" : "s"}</Text>
            </View>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={styles.modalBody}>
            {list.length === 0 && (
              <Text style={styles.bdEmpty}>
                {isCollected ? "No payments received this month." : "Nothing pending for this month."}
              </Text>
            )}
            {list.map((s) => (
              <View key={s.id} style={styles.bdRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bdName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.bdCity} numberOfLines={1}>
                    {s.orgType === "preschool" ? "Preschool" : "Society"}{s.city ? ` · ${s.city}` : ""}
                  </Text>
                </View>
                <Text style={[styles.bdVal, { color }]}>{money(s[field])}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.bdCloseBtn} onPress={onClose}>
              <Text style={styles.bdCloseText}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Metric({ icon, label, value, color, onPress }) {
  return (
    <TouchableOpacity style={styles.metric} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.metricIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color="#B7C1C8" style={styles.metricChevron} />
    </TouchableOpacity>
  );
}

function Fin({ label, value, color, onPress }) {
  return (
    <TouchableOpacity style={[styles.fin, { borderTopColor: color }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.finValue}>{value}</Text>
      <Text style={styles.finLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// Lists the selected metric per society (sorted high -> low), with a total.
function BreakdownModal({ config, rows, onClose }) {
  if (!config) return null;
  const fmt = (v) => (config.money ? money(v) : String(v ?? 0));
  const list = [...rows].sort((a, b) => (b[config.field] || 0) - (a[config.field] || 0));
  const total = rows.reduce((s, r) => s + (Number(r[config.field]) || 0), 0);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name={config.icon} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{config.title} by society</Text>
              <Text style={styles.modalSub}>Total: {fmt(total)} across {rows.length} tenant{rows.length === 1 ? "" : "s"}</Text>
            </View>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={styles.modalBody}>
            {list.length === 0 && <Text style={styles.bdEmpty}>No societies onboarded yet.</Text>}
            {list.map((s) => (
              <View key={s.id} style={styles.bdRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bdName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.bdCity} numberOfLines={1}>
                    {s.orgType === "preschool" ? "Preschool" : "Society"}{s.city ? ` · ${s.city}` : ""}
                  </Text>
                </View>
                <Text style={[styles.bdVal, { color: config.color }]}>{fmt(s[config.field])}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.bdCloseBtn} onPress={onClose}>
              <Text style={styles.bdCloseText}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  logoutBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  heroCard: { backgroundColor: "#0B6E8F", borderRadius: 16, padding: 22 },
  heroLabel: { color: "#CDE9F2", fontSize: 13 },
  heroValue: { color: "#fff", fontSize: 40, fontWeight: "800", marginTop: 2 },
  heroSub: { color: "#CDE9F2", fontSize: 12, marginTop: 4 },
  moderateCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 14, marginTop: 14 },
  moderateIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FEF3E2", alignItems: "center", justifyContent: "center" },
  moderateTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33" },
  moderateSub: { fontSize: 12.5, color: "#6B7B85", marginTop: 2 },
  monthPickerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  monthPickerLabel: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  monthCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginTop: 12, borderLeftWidth: 4, borderLeftColor: "#0B6E8F" },
  monthCardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  monthCardTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  monthTile: { width: "47%", flexGrow: 1, backgroundColor: "#F6F9FA", borderRadius: 12, padding: 14 },
  monthTileValue: { fontSize: 20, fontWeight: "800" },
  monthTileLabel: { color: "#1B2B33", fontSize: 13, fontWeight: "700", marginTop: 4 },
  monthTileHint: { color: "#8895A0", fontSize: 11, marginTop: 2 },
  monthTileChevron: { position: "absolute", right: 10, top: 12 },
  monthRevenue: { backgroundColor: "#FBF6EA", borderRadius: 12, padding: 14, marginTop: 10 },
  monthRevenueLabel: { color: "#8A6A1E", fontSize: 12, fontWeight: "600" },
  monthRevenueValue: { color: "#1B2B33", fontSize: 20, fontWeight: "800", marginTop: 2 },
  monthRevenueSub: { color: "#8A6A1E", fontSize: 11, marginTop: 3 },
  monthTapHint: { color: "#8895A0", fontSize: 11, marginTop: 10, textAlign: "center" },
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
  metricChevron: { position: "absolute", right: 12, top: 14 },
  tapHint: { color: "#8895A0", fontSize: 12, marginTop: 10, marginLeft: 2 },
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
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  modalSub: { fontSize: 12, color: "#CDE9F2", marginTop: 2 },
  modalBody: { padding: 18, paddingTop: 14 },
  bdEmpty: { color: "#6B7B85", textAlign: "center", paddingVertical: 20 },
  bdRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EAEEF0" },
  bdName: { fontWeight: "700", color: "#1B2B33", fontSize: 14 },
  bdCity: { color: "#8895A0", fontSize: 12, marginTop: 2 },
  bdVal: { fontWeight: "800", fontSize: 15 },
  bdCloseBtn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 18 },
  bdCloseText: { color: "#fff", fontWeight: "700" },
});
