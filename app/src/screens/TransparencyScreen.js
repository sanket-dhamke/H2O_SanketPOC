import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { labelsFor, isPreschool } from "../lib/org";
import ScreenHeader from "../components/ScreenHeader";

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const shortMonth = (period) => {
  const [y, m] = String(period).split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[(Number(m) || 1) - 1]} ${String(y).slice(2)}`;
};

const scoreColor = (s) => (s >= 80 ? "#1E7A3D" : s >= 60 ? "#0B6E8F" : s >= 40 ? "#C2571A" : "#B42318");

export default function TransparencyScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const L = labelsFor(user);
  const preschool = isPreschool(user);
  const isAdmin = user?.role === "admin";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = isAdmin ? await api.adminTransparency() : await api.transparency();
      setData(r.transparency);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const r = await api.adminRebuildLedger();
      await load();
      Alert.alert("Ledger sealed", `${r.count} entries hash-chained. Any future edit to history will now be detectable.`);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader icon="shield-checkmark" title="Transparency" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("MaintenanceHome"))} />
        <View style={styles.loading}><ActivityIndicator color="#0B6E8F" /></View>
      </View>
    );
  }
  if (!data) return null;

  const c = scoreColor(data.score);
  const maxFlow = Math.max(1, ...data.moneyFlow.flatMap((m) => [m.in, m.out]));
  const maxExp = Math.max(1, ...data.expenseByLabel.map((e) => e.amount));

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="shield-checkmark"
        title="Transparency"
        subtitle={data.societyName || "Where your money goes"}
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("MaintenanceHome"))}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.howCard}>
          <Text style={styles.howKicker}>How we capture this</Text>
          <Text style={styles.howTitle}>A trust score from the real books</Text>
          <Text style={styles.howText}>
            Every {preschool ? "fee" : "maintenance"} payment (money in) and every labelled expense (money out) is written to a hash-chained ledger. If anyone edits or deletes a past entry, the chain breaks and this page flags it. The 0–100 score is the sum of the six factors below — not a survey.
          </Text>
          <Text style={styles.howText}>
            {L.payers} use this tab to see where {L.org.toLowerCase()} money went. Admins log expenses, collect dues, and can seal / re-verify the ledger.
          </Text>
        </View>

        {/* Score gauge */}
        <View style={styles.scoreCard}>
          <View style={[styles.scoreRing, { borderColor: c }]}>
            <Text style={[styles.scoreNum, { color: c }]}>{data.score}</Text>
            <Text style={styles.scoreOf}>/ 100</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scoreTitle}>Transparency Score</Text>
            <Text style={[styles.scoreBand, { color: c }]}>{data.band}</Text>
            <View style={[styles.integrity, { backgroundColor: data.integrity.ok ? "#EAF7EF" : "#FDECEC" }]}>
              <Ionicons name={data.integrity.ok ? "lock-closed" : "warning"} size={13} color={data.integrity.ok ? "#1E7A3D" : "#B42318"} />
              <Text style={[styles.integrityText, { color: data.integrity.ok ? "#1E7A3D" : "#B42318" }]}>
                {data.integrity.ok ? `Ledger verified · ${data.integrity.count} entries` : `Tampering at #${data.integrity.brokenAt}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totalsRow}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Collected</Text>
            <Text style={[styles.totalVal, { color: "#1E7A3D" }]}>{inr(data.totals.collected)}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Spent</Text>
            <Text style={[styles.totalVal, { color: "#B42318" }]}>{inr(data.totals.expenses)}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Balance</Text>
            <Text style={[styles.totalVal, { color: data.totals.balance >= 0 ? "#0B6E8F" : "#B42318" }]}>{inr(data.totals.balance)}</Text>
          </View>
        </View>

        {/* Money flow */}
        <Text style={styles.sectionTitle}>Money in vs out</Text>
        <View style={styles.card}>
          {data.moneyFlow.length === 0 ? (
            <Text style={styles.muted}>No money movement recorded yet.</Text>
          ) : (
            data.moneyFlow.map((m) => (
              <View key={m.period} style={styles.flowRow}>
                <Text style={styles.flowMonth}>{shortMonth(m.period)}</Text>
                <View style={styles.flowBars}>
                  <View style={styles.flowBarTrack}>
                    <View style={[styles.flowBar, { backgroundColor: "#2E9E52", width: `${(m.in / maxFlow) * 100}%` }]} />
                  </View>
                  <View style={styles.flowBarTrack}>
                    <View style={[styles.flowBar, { backgroundColor: "#E0603A", width: `${(m.out / maxFlow) * 100}%` }]} />
                  </View>
                </View>
              </View>
            ))
          )}
          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: "#2E9E52" }]} /><Text style={styles.legendText}>In</Text></View>
            <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: "#E0603A" }]} /><Text style={styles.legendText}>Out</Text></View>
          </View>
        </View>

        {/* Expense breakdown */}
        {data.expenseByLabel.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Where it was spent</Text>
            <View style={styles.card}>
              {data.expenseByLabel.map((e, i) => (
                <View key={i} style={styles.expRow}>
                  <Text style={styles.expLabel} numberOfLines={1}>{e.label}</Text>
                  <View style={styles.expBarTrack}>
                    <View style={[styles.expBar, { width: `${(e.amount / maxExp) * 100}%` }]} />
                  </View>
                  <Text style={styles.expAmt}>{inr(e.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Score factors */}
        <Text style={styles.sectionTitle}>How the score is calculated</Text>
        <View style={styles.card}>
          {data.factors.map((f) => (
            <View key={f.key} style={styles.factorRow}>
              <Ionicons
                name={f.score >= f.max ? "checkmark-circle" : f.score > 0 ? "alert-circle" : "close-circle"}
                size={18}
                color={f.score >= f.max ? "#1E7A3D" : f.score > 0 ? "#C2571A" : "#B42318"}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.factorLabel}>{f.label}</Text>
                <Text style={styles.factorDetail}>{f.detail}</Text>
              </View>
              <Text style={styles.factorScore}>{f.score}/{f.max}</Text>
            </View>
          ))}
        </View>

        {isAdmin && (
          <TouchableOpacity style={[styles.sealBtn, rebuilding && { opacity: 0.6 }]} onPress={rebuild} disabled={rebuilding}>
            <Ionicons name="lock-closed" size={16} color="#fff" />
            <Text style={styles.sealText}>{rebuilding ? "Sealing…" : "Seal / re-verify ledger"}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.footNote}>
          Every payment and expense is written to a hash-chained ledger. If any past entry is edited or deleted, the chain breaks and the score flags it — so the books can't be quietly changed.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scoreCard: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: "#fff", borderRadius: 16, padding: 18 },
  scoreRing: { width: 92, height: 92, borderRadius: 46, borderWidth: 6, alignItems: "center", justifyContent: "center" },
  scoreNum: { fontSize: 30, fontWeight: "900" },
  scoreOf: { fontSize: 11, color: "#8895A0", marginTop: -2 },
  scoreTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33" },
  scoreBand: { fontSize: 18, fontWeight: "900", marginTop: 2 },
  integrity: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 8 },
  integrityText: { fontSize: 11.5, fontWeight: "700" },
  totalsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  totalCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 14, alignItems: "center" },
  totalLabel: { color: "#6B7B85", fontSize: 12, fontWeight: "700" },
  totalVal: { fontSize: 16, fontWeight: "800", marginTop: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 20, marginBottom: 10 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  muted: { color: "#8895A0", fontSize: 13.5 },
  flowRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  flowMonth: { width: 52, color: "#6B7B85", fontSize: 12, fontWeight: "700" },
  flowBars: { flex: 1, gap: 4 },
  flowBarTrack: { height: 9, backgroundColor: "#F1F5F7", borderRadius: 5, overflow: "hidden" },
  flowBar: { height: 9, borderRadius: 5 },
  legend: { flexDirection: "row", gap: 16, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: "#6B7B85", fontSize: 12, fontWeight: "600" },
  expRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  expLabel: { width: 90, color: "#1B2B33", fontSize: 12.5, fontWeight: "600" },
  expBarTrack: { flex: 1, height: 9, backgroundColor: "#F1F5F7", borderRadius: 5, overflow: "hidden" },
  expBar: { height: 9, borderRadius: 5, backgroundColor: "#0B6E8F" },
  expAmt: { width: 74, textAlign: "right", color: "#48606B", fontSize: 12, fontWeight: "700" },
  factorRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  factorLabel: { color: "#1B2B33", fontWeight: "700", fontSize: 13.5 },
  factorDetail: { color: "#8895A0", fontSize: 12, marginTop: 1 },
  factorScore: { color: "#48606B", fontWeight: "800", fontSize: 12.5 },
  sealBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 14, marginTop: 18 },
  sealText: { color: "#fff", fontWeight: "800" },
  footNote: { color: "#8895A0", fontSize: 12, lineHeight: 18, marginTop: 14 },
  howCard: { backgroundColor: "#EAF4F7", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#C5DDE6" },
  howKicker: { color: "#0B6E8F", fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  howTitle: { color: "#0B3A49", fontSize: 16, fontWeight: "800", marginTop: 4 },
  howText: { color: "#3A5560", fontSize: 13, lineHeight: 19, marginTop: 8 },
});
