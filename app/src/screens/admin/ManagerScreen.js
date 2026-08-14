import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Share,
} from "react-native";
import TextInput from "../../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";
import KeyboardAvoider from "../../components/KeyboardAvoider";

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

const LEVEL = {
  critical: { bg: "#FDECEC", border: "#F3B4B4", tint: "#B42318" },
  warn: { bg: "#FEF6E7", border: "#F5D79E", tint: "#B26B00" },
  info: { bg: "#EAF3F7", border: "#BFDCE7", tint: "#0B6E8F" },
  ok: { bg: "#EAF7EF", border: "#BFE6CD", tint: "#1E7A3D" },
};

const DRAFTS = [
  { kind: "monthly_notice", label: "Monthly notice", icon: "megaphone-outline", hint: "Committee update for everyone" },
  { kind: "defaulter_reminder", label: "Dues reminder", icon: "cash-outline", hint: "Polite nudge to pending payers" },
  { kind: "money_summary", label: "Money summary", icon: "pie-chart-outline", hint: "Where the money went this month" },
];

export default function ManagerScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const L = labelsFor(user);

  const [insights, setInsights] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState(null); // { kind, title, body, busy, posting }

  const load = useCallback(async () => {
    try {
      const r = await api.adminInsights();
      setInsights(r.insights);
      setAiEnabled(!!r.aiEnabled);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
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

  // Maps an alert's action to a destination in the admin tab tree. Returns a
  // handler when we can navigate there, else null (card renders non-tappable).
  const handlerFor = (action) => {
    const routes = {
      finance: () => navigation.navigate("FinanceHome"),
      expenses: () => navigation.navigate("FinanceHome"),
      bookings: () => navigation.navigate("Amenities"),
      helpdesk: () => navigation.navigate("Community", { screen: "Helpdesk" }),
      users: () => navigation.navigate("Members"),
      gate: () => navigation.navigate("Visitors"),
      gateDevices: () => navigation.navigate("Members", { screen: "GateDevices" }),
    };
    return routes[action] || null;
  };

  const generate = async (kind) => {
    if (!aiEnabled) {
      return Alert.alert("AI is off", "Turn on AI on the server (set AI_API_KEY) to auto-draft notices and summaries.");
    }
    setDraft({ kind, title: "", body: "", busy: true, posting: false });
    try {
      const r = await api.adminAiDraft(kind);
      setDraft({ kind, title: r.draft.title, body: r.draft.body, busy: false, posting: false });
    } catch (e) {
      setDraft(null);
      Alert.alert("Couldn't draft", e.message);
    }
  };

  const postAnnouncement = async () => {
    if (!draft?.title?.trim() || !draft?.body?.trim()) {
      return Alert.alert("Add content", "A title and body are required to post.");
    }
    setDraft((d) => ({ ...d, posting: true }));
    try {
      await api.createAnnouncement({ title: draft.title.trim(), body: draft.body.trim(), pinned: false });
      setDraft(null);
      Alert.alert("Posted", "Your announcement is now visible to everyone.");
    } catch (e) {
      setDraft((d) => ({ ...d, posting: false }));
      Alert.alert("Error", e.message);
    }
  };

  const shareDraft = async () => {
    try {
      await Share.share({ message: `${draft.title}\n\n${draft.body}` });
    } catch {}
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader icon="bulb" title={`${L.org} manager`} subtitle="Your AI co-pilot" onBack={() => navigation.goBack()} />
        <View style={styles.loading}>
          <ActivityIndicator color="#0B6E8F" />
        </View>
      </View>
    );
  }

  const f = insights?.finance || {};
  const defaulters = insights?.defaulters || [];
  const alerts = insights?.alerts || [];

  const DeltaBadge = ({ pct }) => {
    if (pct == null) return null;
    const up = pct >= 0;
    return (
      <View style={[styles.delta, { backgroundColor: up ? "#EAF7EF" : "#FDECEC" }]}>
        <Ionicons name={up ? "arrow-up" : "arrow-down"} size={11} color={up ? "#1E7A3D" : "#B42318"} />
        <Text style={[styles.deltaText, { color: up ? "#1E7A3D" : "#B42318" }]}>{Math.abs(pct)}%</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="bulb"
        title={`${L.org} manager`}
        subtitle={insights?.societyName || "Proactive insights & drafts"}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Alerts */}
        <Text style={styles.sectionTitle}>What needs your attention</Text>
        {alerts.map((a, i) => {
          const c = LEVEL[a.level] || LEVEL.info;
          const onPress = handlerFor(a.action);
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={onPress ? 0.7 : 1}
              onPress={onPress || undefined}
              style={[styles.alert, { backgroundColor: c.bg, borderColor: c.border }]}
            >
              <View style={[styles.alertIcon, { backgroundColor: "#fff" }]}>
                <Ionicons name={a.icon || "information-circle"} size={18} color={c.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.alertTitle, { color: c.tint }]}>{a.title}</Text>
                {!!a.detail && <Text style={styles.alertDetail}>{a.detail}</Text>}
              </View>
              {onPress && <Ionicons name="chevron-forward" size={18} color={c.tint} />}
            </TouchableOpacity>
          );
        })}

        {/* Finance snapshot */}
        <Text style={styles.sectionTitle}>This month at a glance</Text>
        <View style={styles.statGrid}>
          <View style={styles.stat}>
            <View style={styles.statTop}>
              <Text style={styles.statLabel}>Collected</Text>
              <DeltaBadge pct={f.collectionDeltaPct} />
            </View>
            <Text style={styles.statValue}>{inr(f.collectedThisMonth)}</Text>
            <Text style={styles.statSub}>vs {inr(f.collectedPrevMonth)} last month</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Pending this month</Text>
            <Text style={[styles.statValue, { color: "#B26B00" }]}>{inr(f.pendingThisMonth)}</Text>
            <Text style={styles.statSub}>{inr(f.pendingTotal)} outstanding all-time</Text>
          </View>
          <View style={styles.stat}>
            <View style={styles.statTop}>
              <Text style={styles.statLabel}>Expenses</Text>
              <DeltaBadge pct={f.expenseDeltaPct == null ? null : f.expenseDeltaPct} />
            </View>
            <Text style={styles.statValue}>{inr(f.expenseThisMonth)}</Text>
            <Text style={styles.statSub}>avg {inr(f.expenseAvg3mo)} / month</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{L.balanceLabel}</Text>
            <Text style={[styles.statValue, { color: f.balance >= 0 ? "#1E7A3D" : "#B42318" }]}>{inr(f.balance)}</Text>
            <Text style={styles.statSub}>collected − expenses</Text>
          </View>
        </View>

        {/* Defaulters */}
        {defaulters.length > 0 && (
          <>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Top dues</Text>
              <TouchableOpacity onPress={() => navigation.navigate("FinanceHome")}>
                <Text style={styles.link}>Open finances</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              {defaulters.slice(0, 6).map((d, i) => (
                <View key={i} style={[styles.defRow, i > 0 && styles.divider]}>
                  <View style={styles.defBadge}>
                    <Text style={styles.defBadgeText}>{d.months}m</Text>
                  </View>
                  <Text style={styles.defFlat}>
                    {d.block ? `${d.block}-` : ""}
                    {d.flatNo}
                  </Text>
                  <Text style={styles.defAmt}>{inr(d.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* AI drafts */}
        <Text style={styles.sectionTitle}>Draft with AI</Text>
        {!aiEnabled && <Text style={styles.aiOff}>AI drafting is off. Set AI_API_KEY on the server to enable it.</Text>}
        <View style={styles.draftRow}>
          {DRAFTS.map((d) => (
            <TouchableOpacity key={d.kind} style={[styles.draftCard, !aiEnabled && { opacity: 0.55 }]} onPress={() => generate(d.kind)}>
              <View style={styles.draftIcon}>
                <Ionicons name={d.icon} size={20} color="#6D3BD1" />
              </View>
              <Text style={styles.draftLabel}>{d.label}</Text>
              <Text style={styles.draftHint}>{d.hint}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Draft review modal */}
      <Modal visible={!!draft} transparent animationType="fade" onRequestClose={() => setDraft(null)}>
        <KeyboardAvoider style={styles.overlay}>
          <View style={styles.modalCard}>
            <LinearGradient colors={["#7A5AF8", "#6D3BD1", "#4B2A9E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
              <View style={styles.modalHeaderIcon}>
                <Ionicons name="sparkles" size={20} color="#fff" />
              </View>
              <Text style={styles.modalTitle}>AI draft — review & edit</Text>
            </LinearGradient>
            {draft?.busy ? (
              <View style={styles.draftBusy}>
                <ActivityIndicator color="#6D3BD1" />
                <Text style={styles.draftBusyText}>Drafting from your latest numbers…</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Title</Text>
                <TextInput style={styles.input} value={draft?.title} onChangeText={(t) => setDraft((d) => ({ ...d, title: t }))} />
                <Text style={styles.label}>Message</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={draft?.body}
                  onChangeText={(t) => setDraft((d) => ({ ...d, body: t }))}
                  multiline
                />
                <Text style={styles.reviewNote}>Review the figures before posting — you can edit anything above.</Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={[styles.mBtn, styles.ghost]} onPress={shareDraft}>
                    <Ionicons name="share-outline" size={16} color="#6D3BD1" />
                    <Text style={styles.ghostText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.mBtn, draft?.posting && { opacity: 0.6 }]} onPress={postAnnouncement} disabled={draft?.posting}>
                    <Ionicons name="megaphone" size={16} color="#fff" />
                    <Text style={styles.mBtnText}>{draft?.posting ? "Posting…" : "Post as announcement"}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setDraft(null)}>
                  <Text style={styles.cancelText}>Discard</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 18, marginBottom: 10 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 10 },
  link: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },

  alert: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  alertIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  alertTitle: { fontSize: 14.5, fontWeight: "800" },
  alertDetail: { color: "#48606B", fontSize: 12.5, marginTop: 2, lineHeight: 17 },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { flexGrow: 1, minWidth: "47%", backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statLabel: { color: "#6B7B85", fontSize: 12.5, fontWeight: "700" },
  statValue: { color: "#1B2B33", fontSize: 20, fontWeight: "800", marginTop: 6 },
  statSub: { color: "#8895A0", fontSize: 11.5, marginTop: 3 },
  delta: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  deltaText: { fontSize: 11, fontWeight: "800" },

  card: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14 },
  defRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: "#EEF2F4" },
  defBadge: { backgroundColor: "#FDECEC", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  defBadgeText: { color: "#B42318", fontWeight: "800", fontSize: 12 },
  defFlat: { flex: 1, fontWeight: "700", color: "#1B2B33", fontSize: 14 },
  defAmt: { fontWeight: "800", color: "#B26B00", fontSize: 14 },

  aiOff: { color: "#8895A0", fontSize: 12.5, marginBottom: 10 },
  draftRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  draftCard: { flexGrow: 1, minWidth: "30%", backgroundColor: "#fff", borderRadius: 14, padding: 14, alignItems: "flex-start" },
  draftIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "#F1EEFF", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  draftLabel: { fontWeight: "800", color: "#1B2B33", fontSize: 13.5 },
  draftHint: { color: "#8895A0", fontSize: 11, marginTop: 2 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#fff", flex: 1 },
  draftBusy: { alignItems: "center", gap: 12, padding: 34 },
  draftBusyText: { color: "#6B7B85", fontWeight: "600" },
  modalBody: { padding: 18 },
  label: { fontSize: 13, fontWeight: "700", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 160, textAlignVertical: "top" },
  reviewNote: { color: "#8895A0", fontSize: 12, marginTop: 10 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  mBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#6D3BD1", borderRadius: 10, paddingVertical: 13 },
  mBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  ghost: { flex: 0, paddingHorizontal: 16, backgroundColor: "#F1EEFF" },
  ghostText: { color: "#6D3BD1", fontWeight: "800", fontSize: 13 },
  cancelBtn: { alignItems: "center", paddingVertical: 14 },
  cancelText: { color: "#8895A0", fontWeight: "700" },
});
