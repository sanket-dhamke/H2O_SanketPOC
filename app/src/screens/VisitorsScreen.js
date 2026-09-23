import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Image,
  Platform,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { labelsFor, isPreschool } from "../lib/org";
import { applyGuardMemory, isParcelVisit, presentVisitor } from "../lib/visitorWait";
import { loadGuardCloses, rememberGuardClose } from "../lib/guardVisitMemory";
import { fetchVisitorLog, peekVisitors, readCachedVisitors } from "../lib/visitorLogCache";
import ScreenHeader from "../components/ScreenHeader";
import OffersRail from "../components/OffersRail";
import AppTextInput from "../components/AppTextInput";

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
  no_response: { label: "No response", color: "#8A5A00", bg: "#FBF3D5" },
  allowed_by_guard: { label: "Allowed by guard", color: "#0B6E8F", bg: "#E7F3F8" },
  sent_back: { label: "Sent back", color: "#6B7B85", bg: "#EEF2F4" },
};

function waitLabel(ms) {
  const mins = Math.ceil((ms || 0) / 60000);
  if (mins <= 1) return "Waiting · under 1 min";
  return `Waiting · ${mins} min left`;
}

export default function VisitorsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [visitors, setVisitors] = useState(() => peekVisitors(user?.id) || []);
  const [booting, setBooting] = useState(() => peekVisitors(user?.id) == null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [guardCloses, setGuardCloses] = useState({});

  useEffect(() => {
    let live = true;
    readCachedVisitors(user?.id).then((rows) => {
      if (!live || !rows) return;
      setVisitors((current) => (current.length ? current : rows));
      setBooting(false);
    });
    return () => {
      live = false;
    };
  }, [user?.id]);

  const load = useCallback(async () => {
    try {
      const [rows, saved] = await Promise.all([fetchVisitorLog(user?.id), loadGuardCloses(user?.id)]);
      setGuardCloses(saved);
      setVisitors(rows);
      setBooting(false);
    } catch (e) {
      setBooting(false);
      if (Platform.OS !== "web") Alert.alert("Error", e.message);
      else setNotice((current) => current || e.message || "Could not load the gate log.");
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const refresh = setInterval(load, 20000);
      const clock = setInterval(() => setNow(Date.now()), 15000);
      return () => {
        clearInterval(refresh);
        clearInterval(clock);
      };
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const fail = (e) => {
    const message = e.message || "Could not update this visit.";
    setNotice(message);
    if (Platform.OS !== "web") Alert.alert("Error", message);
  };

  const decide = async (visitor, status) => {
    setNotice("");
    try {
      await api.decideVisitor(visitor.id, status);
      setReasonFor(null);
      await load();
    } catch (e) {
      fail(e);
    }
  };

  const guardAct = async (visitor, action, note) => {
    setNotice("");
    const trimmed = String(note || "").trim();
    if (action === "allow" && trimmed.length < 3) {
      fail(new Error("Add a short reason for letting them in."));
      return;
    }
    setBusyId(visitor.id);
    try {
      let closedOnCurrentServer = false;
      try {
        await api.guardVisitorAction(visitor.id, { action, reason: trimmed });
      } catch (e) {
        // The hosted API has no guard-action yet. It can still close the row
        // as approved, rejected, or left at the gate. Remember the guard's
        // own outcome so this log does not call that a resident decision.
        const missing = /404|failed \(404\)|Cannot (GET|POST)/i.test(e.message || "");
        if (!missing) throw e;
        const liveStatus = action === "allow" ? "approved" : action === "send_back" ? "rejected" : "leave_at_gate";
        await api.decideVisitor(visitor.id, liveStatus);
        closedOnCurrentServer = action === "allow" || action === "send_back";
        if (closedOnCurrentServer) {
          const saved = await rememberGuardClose(user?.id, visitor.id, {
            status: action === "allow" ? "allowed_by_guard" : "sent_back",
            decisionNote: action === "allow" ? trimmed : "",
          });
          setGuardCloses(saved);
        }
      }
      setReasonFor(null);
      setReason("");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusyId(null);
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
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <FlatList
        data={visitors.map((v) => applyGuardMemory(presentVisitor(v, now), guardCloses))}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {booting ? "Loading the gate log…" : "No visitors yet. Pull down to refresh."}
          </Text>
        }
        ListFooterComponent={
          <View style={{ width: "100%", alignSelf: "stretch" }}>
            <OffersRail slot="visitors" navigation={navigation} compact />
          </View>
        }
        ListFooterComponentStyle={{ width: "100%" }}
        renderItem={({ item }) => {
          const meta = STATUS_META[item.status] || STATUS_META.pending;
          const isResident = user.role === "resident";
          const canDecide = isResident && item.status === "pending";
          const canGuard = !isResident && !preschool && item.status === "no_response";
          const parcel = isParcelVisit(item.purpose);
          const badgeLabel = item.status === "pending" && item.waitMsLeft ? waitLabel(item.waitMsLeft) : meta.label;
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
                  <Text style={[styles.badgeText, { color: meta.color }]}>{badgeLabel}</Text>
                </View>
              </View>

              {item.status === "allowed_by_guard" && item.decisionNote ? (
                <Text style={styles.note}>Guard reason: {item.decisionNote}</Text>
              ) : null}
              {item.status === "pending" && !isResident ? (
                <Text style={styles.note}>The resident has 3 minutes to answer. One phone call goes out if they do not.</Text>
              ) : null}

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

              {canGuard && (
                <View>
                  <Text style={styles.note}>
                    {parcel
                      ? "No one answered. Leave this at the gate, or send them back. Do not send them up."
                      : "No one answered in the app. Call the flat. If they say yes, tap Allowed by guard and write that. Otherwise send them back."}
                  </Text>
                  {reasonFor === item.id ? (
                    <View style={styles.reasonBox}>
                      <AppTextInput
                        style={styles.reasonInput}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Why are you letting them in?"
                      />
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={[styles.action, { backgroundColor: "#0B6E8F" }]}
                          disabled={busyId === item.id}
                          onPress={() => guardAct(item, "allow", reason)}
                        >
                          <Text style={styles.actionText}>Save reason</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.action, styles.actionQuiet]} onPress={() => setReasonFor(null)}>
                          <Text style={styles.actionQuietText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.actions}>
                      {parcel ? (
                        <TouchableOpacity
                          style={[styles.action, { backgroundColor: "#7A5AC2" }]}
                          disabled={busyId === item.id}
                          onPress={() => guardAct(item, "leave_at_gate")}
                        >
                          <Text style={styles.actionText}>Leave at gate</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.action, { backgroundColor: "#0B6E8F" }]}
                          disabled={busyId === item.id}
                          onPress={() => {
                            setReasonFor(item.id);
                            setReason("");
                          }}
                        >
                          <Text style={styles.actionText}>Allowed by guard</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.action, styles.actionQuiet]}
                        disabled={busyId === item.id}
                        onPress={() => guardAct(item, "send_back")}
                      >
                        <Text style={styles.actionQuietText}>Send back</Text>
                      </TouchableOpacity>
                    </View>
                  )}
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
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, maxWidth: 118, flexShrink: 1 },
  badgeText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  notice: { color: "#B42318", paddingHorizontal: 16, paddingTop: 12, fontSize: 13 },
  note: { color: "#6B7B85", marginTop: 10, fontSize: 12, lineHeight: 17 },
  reasonBox: { marginTop: 8 },
  reasonInput: {
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  action: { flexGrow: 1, flexBasis: "46%", paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 13, textAlign: "center" },
  actionQuiet: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D6DEE3" },
  actionQuietText: { color: "#1B2B33", fontWeight: "700", fontSize: 13, textAlign: "center" },
  exitBtn: { marginTop: 12, borderWidth: 1, borderColor: "#0B6E8F", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  exitText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
});
