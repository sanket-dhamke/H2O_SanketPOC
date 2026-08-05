import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { labelsFor } from "../lib/org";
import ScreenHeader from "../components/ScreenHeader";
import { TICKET_CATEGORIES, STATUS_META } from "./HelpdeskScreen";

const catMeta = (id) => TICKET_CATEGORIES.find((c) => c.id === id) || TICKET_CATEGORIES[5];
const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "");

export default function TicketDetailScreen({ navigation, route }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const isAdmin = user?.role === "admin";
  const ticketId = route?.params?.ticketId;
  const [ticket, setTicket] = useState(null);
  const [comment, setComment] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { ticket } = await api.ticket(ticketId);
      setTicket(ticket);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, [ticketId]);

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

  const send = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.addTicketComment(ticketId, comment.trim());
      setComment("");
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status) => {
    setBusy(true);
    try {
      const { ticket: updated } = await api.updateTicket(ticketId, { status });
      setTicket(updated);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const resolveWithNote = () => {
    if (Platform.OS === "web") {
      // Alert.prompt isn't available on web; just mark resolved.
      setStatus("resolved");
      return;
    }
    Alert.prompt?.(
      "Resolve ticket",
      "Add a short closing note (optional):",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Resolve",
          onPress: async (note) => {
            setBusy(true);
            try {
              const { ticket: updated } = await api.updateTicket(ticketId, { status: "resolved", resolution: note || "" });
              setTicket(updated);
            } catch (e) {
              Alert.alert("Error", e.message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
      "plain-text"
    ) || setStatus("resolved");
  };

  if (!ticket) {
    return (
      <View style={styles.container}>
        <ScreenHeader icon="help-buoy" title="Ticket" onBack={() => navigation.goBack()} />
        <ActivityIndicator color="#0B6E8F" style={{ marginTop: 40 }} />
      </View>
    );
  }

  const meta = catMeta(ticket.category);
  const sm = STATUS_META[ticket.status] || STATUS_META.open;
  const comments = ticket.comments || [];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader icon="help-buoy" title="Ticket" subtitle={meta.label} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.catChip}>
              <Ionicons name={meta.icon} size={12} color="#0B6E8F" />
              <Text style={styles.catText}>{meta.label}</Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: sm.bg }]}>
              <Text style={[styles.statusText, { color: sm.color }]}>{sm.label}</Text>
            </View>
          </View>
          <Text style={styles.subject}>{ticket.subject}</Text>
          <Text style={styles.desc}>{ticket.description}</Text>
          <Text style={styles.meta}>
            Raised by {ticket.authorName}
            {ticket.flatNo ? ` · ${ticket.flatNo}` : ""} · {fmt(ticket.createdAt)}
          </Text>
          {ticket.status === "resolved" && !!ticket.resolution && (
            <View style={styles.resolutionBox}>
              <Ionicons name="checkmark-circle" size={16} color="#2E9E52" />
              <Text style={styles.resolutionText}>{ticket.resolution}</Text>
            </View>
          )}
        </View>

        {/* Admin controls */}
        {isAdmin && ticket.status !== "resolved" && (
          <View style={styles.adminRow}>
            {ticket.status === "open" && (
              <TouchableOpacity style={[styles.adminBtn, { backgroundColor: "#EAF4F7" }]} onPress={() => setStatus("in_progress")} disabled={busy}>
                <Ionicons name="time-outline" size={16} color="#0B6E8F" />
                <Text style={[styles.adminBtnText, { color: "#0B6E8F" }]}>Mark in progress</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.adminBtn, { backgroundColor: "#2E9E52" }]} onPress={resolveWithNote} disabled={busy}>
              <Ionicons name="checkmark-done" size={16} color="#fff" />
              <Text style={[styles.adminBtnText, { color: "#fff" }]}>Resolve</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Thread */}
        <Text style={styles.threadTitle}>Conversation</Text>
        {comments.length === 0 && <Text style={styles.empty}>No replies yet.</Text>}
        {comments.map((c) => {
          const mine = c.authorId === user?.id;
          return (
            <View key={c.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[styles.bubbleAuthor, mine && { color: "#DCEFF5" }]}>
                {c.authorName || "User"}{c.authorRole === "admin" ? " · Office" : ""}
              </Text>
              <Text style={[styles.bubbleBody, mine && { color: "#fff" }]}>{c.body}</Text>
              <Text style={[styles.bubbleTime, mine && { color: "#CDE9F2" }]}>{fmt(c.createdAt)}</Text>
            </View>
          );
        })}
      </ScrollView>

      {ticket.status !== "resolved" ? (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder={isAdmin ? `Reply to ${L.payer.toLowerCase()}…` : "Add a message…"}
            multiline
          />
          <TouchableOpacity style={[styles.sendBtn, busy && { opacity: 0.5 }]} onPress={send} disabled={busy}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.closedBar}>
          <Ionicons name="lock-closed" size={14} color="#6B7B85" />
          <Text style={styles.closedText}>This ticket is resolved. Pull to refresh if reopened.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EAF4F7", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  catText: { color: "#0B6E8F", fontSize: 11, fontWeight: "700" },
  statusChip: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: "800" },
  subject: { fontSize: 18, fontWeight: "800", color: "#1B2B33" },
  desc: { color: "#48606B", marginTop: 6, lineHeight: 21 },
  meta: { color: "#9AA7AF", fontSize: 12, marginTop: 10, fontWeight: "600" },
  resolutionBox: { flexDirection: "row", gap: 8, backgroundColor: "#E3F5E8", borderRadius: 10, padding: 12, marginTop: 12 },
  resolutionText: { flex: 1, color: "#1F7A3D", fontSize: 13, fontWeight: "600" },
  adminRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  adminBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 12 },
  adminBtnText: { fontWeight: "700", fontSize: 13 },
  threadTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 22, marginBottom: 10 },
  empty: { color: "#8895A0", fontSize: 13 },
  bubble: { maxWidth: "88%", borderRadius: 14, padding: 12, marginBottom: 10 },
  theirs: { backgroundColor: "#fff", alignSelf: "flex-start", borderTopLeftRadius: 4 },
  mine: { backgroundColor: "#0B6E8F", alignSelf: "flex-end", borderTopRightRadius: 4 },
  bubbleAuthor: { fontSize: 11, fontWeight: "700", color: "#6B7B85", marginBottom: 3 },
  bubbleBody: { color: "#1B2B33", fontSize: 14.5, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: "#9AA7AF", marginTop: 5 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 12, gap: 10, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E6EDF0" },
  input: { flex: 1, borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, backgroundColor: "#F8FAFB", maxHeight: 110 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#0B6E8F", alignItems: "center", justifyContent: "center" },
  closedBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E6EDF0" },
  closedText: { color: "#6B7B85", fontSize: 12.5 },
});
