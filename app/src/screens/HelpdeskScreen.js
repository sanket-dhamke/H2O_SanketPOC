import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  Linking,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";

const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export const TICKET_CATEGORIES = [
  { id: "plumbing", label: "Plumbing", icon: "water-outline" },
  { id: "electrical", label: "Electrical", icon: "flash-outline" },
  { id: "housekeeping", label: "Housekeeping", icon: "sparkles-outline" },
  { id: "security", label: "Security", icon: "shield-checkmark-outline" },
  { id: "billing", label: "Billing", icon: "card-outline" },
  { id: "general", label: "General", icon: "chatbubbles-outline" },
  { id: "other", label: "Other", icon: "ellipsis-horizontal" },
];
const catMeta = (id) => TICKET_CATEGORIES.find((c) => c.id === id) || TICKET_CATEGORIES[5];

export const STATUS_META = {
  open: { label: "Open", color: "#C2571A", bg: "#FBEadd" },
  in_progress: { label: "In progress", color: "#0B6E8F", bg: "#EAF4F7" },
  resolved: { label: "Resolved", color: "#2E9E52", bg: "#E3F5E8" },
};

const cleanPhone = (p) => String(p || "").replace(/[^\d+]/g, "");

export default function HelpdeskScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const isAdmin = user?.role === "admin";
  const [contacts, setContacts] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [ticketModal, setTicketModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([api.helpdeskContacts(), api.tickets()]);
      setContacts(c.contacts || []);
      setTickets(t.tickets || []);
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

  const call = (phone) => Linking.openURL(`tel:${cleanPhone(phone)}`).catch(() => {});

  const guards = contacts.filter((c) => c.role === "guard");
  const admins = contacts.filter((c) => c.role === "admin");

  const addBtn = (
    <TouchableOpacity onPress={() => setTicketModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="help-buoy"
        title="Helpdesk"
        subtitle={isAdmin ? "Resident tickets & contacts" : "Raise a request or reach the office"}
        onBack={() => navigation.goBack()}
        right={addBtn}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Quick contact + directory */}
        <View style={styles.quickRow}>
          {guards[0] && (
            <QuickAction icon="shield-checkmark" label="Call security" tint="#7A5AF8" onPress={() => call(guards[0].phone)} disabled={!guards[0].phone} />
          )}
          {admins[0] && (
            <QuickAction icon="business" label="Call office" tint="#0B6E8F" onPress={() => call(admins[0].phone)} disabled={!admins[0].phone} />
          )}
          <QuickAction icon="people" label="Directory" tint="#2E9E52" onPress={() => navigation.navigate("Directory")} />
          <QuickAction icon="add-circle" label="New ticket" tint="#C2571A" onPress={() => setTicketModal(true)} />
        </View>

        {/* Contacts list */}
        {contacts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Society contacts</Text>
            {contacts.map((c) => (
              <View key={c.id} style={styles.contactCard}>
                <View style={[styles.contactIcon, { backgroundColor: c.role === "guard" ? "#F1EEFF" : "#EAF4F7" }]}>
                  <Ionicons name={c.role === "guard" ? "shield-checkmark" : "business"} size={18} color={c.role === "guard" ? "#7A5AF8" : "#0B6E8F"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{c.name}</Text>
                  <Text style={styles.contactRole}>{c.role === "guard" ? "Gate / security" : "Office / admin"}{c.phone ? ` · ${c.phone}` : " · no number on file"}</Text>
                </View>
                {c.phone ? (
                  <TouchableOpacity style={styles.callBtn} onPress={() => call(c.phone)}>
                    <Ionicons name="call" size={18} color="#0B6E8F" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </>
        )}

        {/* Tickets */}
        <View style={styles.ticketsHead}>
          <Text style={styles.sectionTitle}>{isAdmin ? "All tickets" : "My tickets"}</Text>
          <TouchableOpacity onPress={() => setTicketModal(true)}>
            <Text style={styles.raiseLink}>+ Raise a ticket</Text>
          </TouchableOpacity>
        </View>

        {tickets.length === 0 && <Text style={styles.empty}>No tickets yet. Tap “Raise a ticket” to report an issue.</Text>}
        {tickets.map((t) => {
          const meta = catMeta(t.category);
          const sm = STATUS_META[t.status] || STATUS_META.open;
          return (
            <TouchableOpacity key={t.id} style={styles.ticketCard} onPress={() => navigation.navigate("TicketDetail", { ticketId: t.id })}>
              <View style={styles.ticketTop}>
                <View style={styles.catChip}>
                  <Ionicons name={meta.icon} size={12} color="#0B6E8F" />
                  <Text style={styles.catText}>{meta.label}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: sm.bg }]}>
                  <Text style={[styles.statusText, { color: sm.color }]}>{sm.label}</Text>
                </View>
                <Text style={styles.ticketTime}>{timeAgo(t.createdAt)}</Text>
              </View>
              <Text style={styles.ticketSubject}>{t.subject}</Text>
              <Text style={styles.ticketDesc} numberOfLines={2}>{t.description}</Text>
              <View style={styles.ticketFoot}>
                {isAdmin && <Text style={styles.ticketMeta}>{t.authorName}{t.flatNo ? ` · ${t.flatNo}` : ""}</Text>}
                <Text style={styles.ticketMeta}>{t.commentCount > 0 ? `${t.commentCount} update${t.commentCount === 1 ? "" : "s"}` : "No replies yet"}</Text>
                <Ionicons name="chevron-forward" size={16} color="#B7C1C8" />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TicketModal visible={ticketModal} onClose={() => setTicketModal(false)} onDone={load} />
    </View>
  );
}

function QuickAction({ icon, label, tint, onPress, disabled }) {
  return (
    <TouchableOpacity style={[styles.quick, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
      <View style={[styles.quickIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function TicketModal({ visible, onClose, onDone }) {
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCategory("general");
    setSubject("");
    setDescription("");
    setPriority("normal");
  };

  const submit = async () => {
    if (!subject.trim() || !description.trim()) {
      Alert.alert("Missing info", "Enter a subject and describe the issue.");
      return;
    }
    setBusy(true);
    try {
      await api.createTicket({ category, subject: subject.trim(), description: description.trim(), priority });
      reset();
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="help-buoy-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Raise a ticket</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Category</Label>
            <View style={styles.catPick}>
              {TICKET_CATEGORIES.map((c) => (
                <TouchableOpacity key={c.id} style={[styles.catOpt, category === c.id && styles.catOptActive]} onPress={() => setCategory(c.id)}>
                  <Ionicons name={c.icon} size={14} color={category === c.id ? "#fff" : "#0B6E8F"} />
                  <Text style={[styles.catOptText, category === c.id && { color: "#fff" }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label>Subject</Label>
            <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="e.g. Water leakage in bathroom" />
            <Label>Describe the issue</Label>
            <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Give details so it can be resolved faster…" multiline />
            <Label>Priority</Label>
            <View style={styles.priorityRow}>
              {["low", "normal", "high"].map((p) => (
                <TouchableOpacity key={p} style={[styles.prioOpt, priority === p && styles.prioActive]} onPress={() => setPriority(p)}>
                  <Text style={[styles.prioText, priority === p && { color: "#fff" }]}>{p[0].toUpperCase() + p.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Sending…" : "Submit ticket"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  quick: { width: "22%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, alignItems: "center", gap: 8 },
  quickIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickLabel: { color: "#334", fontWeight: "700", fontSize: 11.5, textAlign: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 18, marginBottom: 10 },
  contactCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 10 },
  contactIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  contactName: { fontSize: 15, fontWeight: "700", color: "#1B2B33" },
  contactRole: { color: "#6B7B85", fontSize: 12.5, marginTop: 2 },
  callBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center" },
  ticketsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
  raiseLink: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 16, marginBottom: 8 },
  ticketCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginTop: 12 },
  ticketTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EAF4F7", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  catText: { color: "#0B6E8F", fontSize: 11, fontWeight: "700" },
  statusChip: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: "800" },
  ticketTime: { flex: 1, textAlign: "right", color: "#9AA7AF", fontSize: 11 },
  ticketSubject: { fontSize: 15.5, fontWeight: "800", color: "#1B2B33" },
  ticketDesc: { color: "#48606B", marginTop: 4, lineHeight: 19, fontSize: 13 },
  ticketFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  ticketMeta: { color: "#9AA7AF", fontSize: 12, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  catPick: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catOpt: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  catOptActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  catOptText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
  priorityRow: { flexDirection: "row", gap: 10 },
  prioOpt: { flex: 1, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  prioActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  prioText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
