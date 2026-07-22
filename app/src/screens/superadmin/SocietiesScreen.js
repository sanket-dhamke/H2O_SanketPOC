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
  TextInput,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

export default function SocietiesScreen() {
  const [societies, setSocieties] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [adminFor, setAdminFor] = useState(null); // society object when adding an admin
  const [resetModal, setResetModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.superListSocieties();
      setSocieties(res.societies || []);
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

  const toggleActive = async (s) => {
    try {
      await api.superUpdateSociety(s.id, { active: !s.active });
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const headerBtns = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <TouchableOpacity onPress={() => setResetModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="key-outline" size={20} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setCreateModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="business"
        title="Societies"
        subtitle={`${societies.length} onboarded`}
        right={headerBtns}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {societies.length === 0 && (
          <Text style={styles.empty}>No societies yet. Tap + to onboard the first one.</Text>
        )}
        {societies.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.city}>{s.city || "—"}</Text>
              </View>
              <View style={[styles.badge, s.active ? styles.badgeOn : styles.badgeOff]}>
                <Text style={[styles.badgeText, s.active ? { color: "#1E7A3D" } : { color: "#9A3412" }]}>
                  {s.active ? "Active" : "Inactive"}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <Chip icon="home" text={`${s.flats} flats`} />
              <Chip icon="people" text={`${s.residents} residents`} />
              <Chip icon="briefcase" text={`${s.admins} admin${s.admins === 1 ? "" : "s"}`} />
            </View>

            <View style={styles.finRow}>
              <View style={styles.finBox}>
                <Text style={styles.finLabel}>Collected</Text>
                <Text style={[styles.finVal, { color: "#2E9E52" }]}>{money(s.collected)}</Text>
              </View>
              <View style={styles.finBox}>
                <Text style={styles.finLabel}>Pending</Text>
                <Text style={[styles.finVal, { color: "#C2571A" }]}>{money(s.pending)}</Text>
              </View>
              <View style={styles.finBox}>
                <Text style={styles.finLabel}>Balance</Text>
                <Text style={styles.finVal}>{money(s.balance)}</Text>
              </View>
            </View>

            {!!s.adminEmails?.length && (
              <Text style={styles.admins} numberOfLines={1}>
                Admins: {s.adminEmails.join(", ")}
              </Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionGhost} onPress={() => setAdminFor(s)}>
                <Ionicons name="person-add-outline" size={16} color="#0B6E8F" />
                <Text style={styles.actionGhostText}>Add admin</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionGhost, !s.active && styles.actionOn]}
                onPress={() => toggleActive(s)}
              >
                <Ionicons
                  name={s.active ? "pause-circle-outline" : "play-circle-outline"}
                  size={16}
                  color={s.active ? "#C2571A" : "#1E7A3D"}
                />
                <Text style={[styles.actionGhostText, { color: s.active ? "#C2571A" : "#1E7A3D" }]}>
                  {s.active ? "Deactivate" : "Activate"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <CreateSocietyModal visible={createModal} onClose={() => setCreateModal(false)} onDone={load} />
      <AddAdminModal society={adminFor} onClose={() => setAdminFor(null)} onDone={load} />
      <ResetPasswordModal visible={resetModal} onClose={() => setResetModal(false)} />
    </View>
  );
}

const ROLE_LABEL = { superadmin: "Owner", admin: "Admin", guard: "Guard", resident: "Resident" };

// Superadmin tool: find any user across societies and set a new password for them
// (used when someone — even a society admin — forgets their password).
function ResetPasswordModal({ visible, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setNewPassword("");
  };

  const search = async () => {
    setSearching(true);
    try {
      const r = await api.superSearchUsers(query.trim());
      setResults(r.users || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSearching(false);
    }
  };

  const doReset = async () => {
    if (!selected || !newPassword) {
      Alert.alert("Missing info", "Pick a user and enter a new password.");
      return;
    }
    setBusy(true);
    try {
      await api.superResetPassword(selected.id, newPassword);
      Alert.alert("Password reset", `New password set for ${selected.email}. Share it with them securely.`);
      reset();
      onClose();
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
              <Ionicons name="key-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Reset a user's password</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Find user by email or name</Label>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={query}
                onChangeText={setQuery}
                placeholder="admin@society.com"
                autoCapitalize="none"
                onSubmitEditing={search}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={searching}>
                <Ionicons name="search" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {searching && <Text style={styles.muted}>Searching…</Text>}
            {!searching && results.length === 0 && !!query && (
              <Text style={styles.muted}>No users found. Try a different email or name.</Text>
            )}

            {results.map((u) => {
              const active = selected?.id === u.id;
              return (
                <TouchableOpacity key={u.id} style={[styles.userRow, active && styles.userRowActive]} onPress={() => setSelected(u)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{u.name}</Text>
                    <Text style={styles.userMeta}>{u.email}</Text>
                    <Text style={styles.userMeta}>
                      {ROLE_LABEL[u.role] || u.role}
                      {u.societyName ? ` · ${u.societyName}` : u.role === "superadmin" ? " · Platform" : ""}
                      {u.flatNo ? ` · ${u.flatNo}` : ""}
                    </Text>
                  </View>
                  <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? "#0B6E8F" : "#B7C1C8"} />
                </TouchableOpacity>
              );
            })}

            {!!selected && (
              <>
                <Label>New password for {selected.email}</Label>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 8 chars, 1 upper, 1 lower, 1 number"
                  autoCapitalize="none"
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => { reset(); onClose(); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, (busy || !selected) && { opacity: 0.6 }]} onPress={doReset} disabled={busy || !selected}>
                <Text style={styles.modalBtnText}>{busy ? "Saving…" : "Reset password"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ icon, text }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={13} color="#0B6E8F" />
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

function CreateSocietyModal({ visible, onClose, onDone }) {
  const [f, setF] = useState({ name: "", city: "", address: "", adminName: "", adminEmail: "", adminPassword: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim()) {
      Alert.alert("Missing info", "Enter a society name.");
      return;
    }
    setBusy(true);
    try {
      await api.superCreateSociety({
        name: f.name.trim(),
        city: f.city.trim(),
        address: f.address.trim(),
        adminName: f.adminName.trim() || undefined,
        adminEmail: f.adminEmail.trim() || undefined,
        adminPassword: f.adminPassword || undefined,
      });
      Alert.alert("Society created", f.adminName ? "The admin can now log in." : "Add an admin from the list.");
      setF({ name: "", city: "", address: "", adminName: "", adminEmail: "", adminPassword: "" });
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal visible={visible} onClose={onClose} title="Onboard a society" icon="business-outline" busy={busy} onSubmit={submit}>
      <Label>Society name *</Label>
      <TextInput style={styles.input} value={f.name} onChangeText={set("name")} placeholder="Green Valley Residency" />
      <Label>City</Label>
      <TextInput style={styles.input} value={f.city} onChangeText={set("city")} placeholder="Pune" />
      <Label>Address</Label>
      <TextInput style={styles.input} value={f.address} onChangeText={set("address")} placeholder="Baner Road, Pune" />
      <Text style={styles.divider}>First admin (optional)</Text>
      <Label>Admin name</Label>
      <TextInput style={styles.input} value={f.adminName} onChangeText={set("adminName")} placeholder="Society Admin" />
      <Label>Admin email</Label>
      <TextInput style={styles.input} value={f.adminEmail} onChangeText={set("adminEmail")} placeholder="admin@society.com" autoCapitalize="none" keyboardType="email-address" />
      <Label>Admin password</Label>
      <TextInput style={styles.input} value={f.adminPassword} onChangeText={set("adminPassword")} placeholder="At least 8 chars, 1 letter + 1 number" secureTextEntry />
    </FormModal>
  );
}

function AddAdminModal({ society, onClose, onDone }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim() || !f.email.trim() || !f.password) {
      Alert.alert("Missing info", "Name, email and password are required.");
      return;
    }
    setBusy(true);
    try {
      await api.superAddAdmin(society.id, {
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim() || undefined,
        password: f.password,
      });
      Alert.alert("Admin added", `${f.email.trim()} can now manage ${society.name}.`);
      setF({ name: "", email: "", phone: "", password: "" });
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      visible={!!society}
      onClose={onClose}
      title={society ? `Add admin · ${society.name}` : "Add admin"}
      icon="person-add-outline"
      busy={busy}
      onSubmit={submit}
    >
      <Label>Name</Label>
      <TextInput style={styles.input} value={f.name} onChangeText={set("name")} placeholder="Admin name" />
      <Label>Email</Label>
      <TextInput style={styles.input} value={f.email} onChangeText={set("email")} placeholder="admin@society.com" autoCapitalize="none" keyboardType="email-address" />
      <Label>Phone</Label>
      <TextInput style={styles.input} value={f.phone} onChangeText={set("phone")} placeholder="Optional" keyboardType="phone-pad" />
      <Label>Password</Label>
      <TextInput style={styles.input} value={f.password} onChangeText={set("password")} placeholder="At least 8 chars, 1 letter + 1 number" secureTextEntry />
    </FormModal>
  );
}

function FormModal({ visible, onClose, title, icon, children, busy, onSubmit }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name={icon || "create-outline"} size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{title}</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {children}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={onSubmit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Saving..." : "Save"}</Text>
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
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  name: { fontSize: 17, fontWeight: "800", color: "#1B2B33" },
  city: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeOn: { backgroundColor: "#DFF3E6" },
  badgeOff: { backgroundColor: "#FBE4D5" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EAF4F7", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: "#0B6E8F", fontSize: 12, fontWeight: "600" },
  finRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  finBox: { flex: 1, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 10 },
  finLabel: { color: "#6B7B85", fontSize: 11 },
  finVal: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 2 },
  admins: { color: "#6B7B85", fontSize: 12, marginTop: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionGhost: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EEF4F6", borderRadius: 10, paddingVertical: 11 },
  actionOn: { backgroundColor: "#DFF3E6" },
  actionGhostText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  divider: { marginTop: 18, marginBottom: 2, fontSize: 13, fontWeight: "800", color: "#0B6E8F" },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
  searchBtn: { width: 48, backgroundColor: "#0B6E8F", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  muted: { color: "#8895A0", fontSize: 13, marginTop: 12 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#E1E8EC", borderRadius: 10, padding: 12, marginTop: 10 },
  userRowActive: { borderColor: "#0B6E8F", backgroundColor: "#F1F8FB" },
  userName: { fontWeight: "800", color: "#1B2B33" },
  userMeta: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
});
