import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
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
import KeyboardAvoider from "../components/KeyboardAvoider";

const cleanPhone = (p) => String(p || "").replace(/[^\d+]/g, "");

const CAT_META = {
  helpers: { label: "Daily help", icon: "people-circle", color: "#0B6E8F" },
  trades: { label: "Home services", icon: "construct", color: "#7A5AF8" },
  medical: { label: "Medical", icon: "medkit", color: "#B42318" },
  utilities: { label: "Utilities & civic", icon: "flash", color: "#C2571A" },
  emergency: { label: "Emergency", icon: "alert-circle", color: "#D92D20" },
  lifestyle: { label: "Lifestyle", icon: "sparkles", color: "#2E9E52" },
};
const catMeta = (id) => CAT_META[id] || { label: id, icon: "pricetag", color: "#0B6E8F" };

const SUGGESTIONS = {
  helpers: ["Maid", "Cook", "Driver", "Car cleaner", "Nanny", "Gardener"],
  trades: ["Electrician", "Plumber", "Carpenter", "AC / appliance repair", "Pest control", "Painter"],
  medical: ["Doctor on call", "Clinic", "Pharmacy", "Ambulance", "Blood bank", "Dentist"],
  utilities: ["Electricity board", "Water tanker", "Gas agency", "Municipal", "Internet / cable"],
  emergency: ["Police", "Fire", "Society security", "Women's helpline"],
  lifestyle: ["Tiffin / food", "Tutor", "Salon", "Laundry", "Courier"],
};

export default function ServicesScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const role = user?.role;
  const isSuperadmin = role === "superadmin";
  const isAdmin = role === "admin";

  const [contacts, setContacts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [tab, setTab] = useState("directory"); // directory | mine
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [editor, setEditor] = useState(null); // null | {} (new) | contact (edit)

  const load = useCallback(async () => {
    try {
      const r = await api.services();
      setContacts(r.contacts || []);
      setSuggestions(r.suggestions || []);
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

  const call = useCallback((phone) => Linking.openURL(`tel:${cleanPhone(phone)}`).catch(() => {}), []);
  const whatsapp = useCallback(
    (phone) =>
      Linking.openURL(`https://wa.me/${cleanPhone(phone).replace(/^\+/, "")}`).catch(() =>
        Alert.alert("WhatsApp unavailable", "Couldn't open WhatsApp for this number.")
      ),
    []
  );

  const visible = useMemo(() => {
    let list = contacts;
    if (!isSuperadmin) {
      list = list.filter((c) => (tab === "mine" ? c.scope === "personal" && c.mine : c.scope !== "personal"));
    }
    if (cat !== "all") list = list.filter((c) => c.category === cat);
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.subtype?.toLowerCase().includes(q) ||
          c.note?.toLowerCase().includes(q) ||
          c.phone?.includes(q)
      );
    return list;
  }, [contacts, tab, cat, query, isSuperadmin]);

  const approve = async (c) => {
    try {
      await api.updateService(c.id, { status: "published" });
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };
  const reject = (c) =>
    Alert.alert("Reject suggestion", `Discard “${c.name}”?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: async () => { try { await api.deleteService(c.id); load(); } catch (e) { Alert.alert("Error", e.message); } } },
    ]);

  const toggleFeature = useCallback(async (c) => {
    try {
      await api.updateService(c.id, { featured: !c.featured });
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, [load]);

  const remove = useCallback((c) =>
    Alert.alert("Delete", `Remove “${c.name}”?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api.deleteService(c.id); load(); } catch (e) { Alert.alert("Error", e.message); } } },
    ]), [load]);

  const openEditor = useCallback((c) => setEditor(c), []);

  const canEdit = (c) => c.mine || (isAdmin && c.scope === "society") || (isSuperadmin && c.scope === "platform");

  const addBtn = (
    <TouchableOpacity onPress={() => setEditor({})} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  );

  const subtitle = isSuperadmin
    ? "GateMate-curated helplines (all societies)"
    : "Trusted numbers for your society";

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="construct"
        title="Services & helplines"
        subtitle={subtitle}
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
        right={addBtn}
      />

      {!isSuperadmin && (
        <View style={styles.segment}>
          <Seg label="Directory" active={tab === "directory"} onPress={() => setTab("directory")} />
          <Seg label="My contacts" active={tab === "mine"} onPress={() => setTab("mine")} />
        </View>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#8895A0" />
        <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search maid, electrician, ambulance…" />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catBar}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        <Chip label="All" active={cat === "all"} onPress={() => setCat("all")} />
        {Object.keys(CAT_META).map((id) => (
          <Chip key={id} label={catMeta(id).label} active={cat === id} icon={catMeta(id).icon} onPress={() => setCat(id)} />
        ))}
      </ScrollView>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={11}
        ListHeaderComponent={
          isAdmin && suggestions.length > 0 ? (
            <View>
              <Text style={styles.sectionTitle}>Resident suggestions ({suggestions.length})</Text>
              {suggestions.map((c) => (
                <View key={c.id} style={[styles.card, styles.suggestCard]}>
                  <View style={styles.rowTop}>
                    <View style={[styles.catIcon, { backgroundColor: catMeta(c.category).color + "1A" }]}>
                      <Ionicons name={catMeta(c.category).icon} size={18} color={catMeta(c.category).color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{c.name}</Text>
                      <Text style={styles.sub}>
                        {c.subtype ? `${c.subtype} · ` : ""}{c.phone || "no number"}
                        {c.suggestedByName ? ` · by ${c.suggestedByName}` : ""}
                      </Text>
                    </View>
                  </View>
                  {!!c.note && <Text style={styles.note}>{c.note}</Text>}
                  <View style={styles.actions}>
                    <Act icon="checkmark-circle-outline" label="Approve" color="#2E9E52" onPress={() => approve(c)} />
                    <Act icon="close-circle-outline" label="Reject" color="#B42318" onPress={() => reject(c)} />
                  </View>
                </View>
              ))}
              <Text style={styles.sectionTitle}>Directory</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="call-outline" size={30} color="#B7C2C9" />
            <Text style={styles.emptyText}>
              {tab === "mine" ? "No personal contacts yet. Tap + to add one." : "No contacts here yet."}
            </Text>
          </View>
        }
        renderItem={({ item: c }) => (
          <ContactCard
            c={c}
            canEdit={canEdit(c)}
            canFeature={(isAdmin && c.scope === "society") || (isSuperadmin && c.scope === "platform")}
            onCall={call}
            onWhatsapp={whatsapp}
            onFeature={toggleFeature}
            onEdit={openEditor}
            onDelete={remove}
          />
        )}
      />

      <ServiceEditor
        visible={!!editor}
        contact={editor && editor.id ? editor : null}
        role={role}
        onClose={() => setEditor(null)}
        onDone={load}
      />
    </View>
  );
}

function Badge({ text, tint }) {
  return (
    <View style={[styles.badge, { backgroundColor: tint + "1A" }]}>
      <Text style={[styles.badgeText, { color: tint }]}>{text}</Text>
    </View>
  );
}

const ContactCard = React.memo(function ContactCard({ c, canEdit, canFeature, onCall, onWhatsapp, onFeature, onEdit, onDelete }) {
  const meta = catMeta(c.category);
  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <View style={[styles.catIcon, { backgroundColor: meta.color + "1A" }]}>
          <Ionicons name={meta.icon} size={18} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{c.name}</Text>
            {c.featured && <Ionicons name="star" size={13} color="#C99000" />}
            {c.scope === "platform" && <Badge text="GateMate" tint="#0B6E8F" />}
            {c.scope === "personal" && <Badge text="Private" tint="#8895A0" />}
          </View>
          <Text style={styles.sub}>
            {c.subtype ? c.subtype : meta.label}
            {c.phone ? ` · ${c.phone}` : ""}
          </Text>
          {!!c.note && <Text style={styles.note}>{c.note}</Text>}
        </View>
        {c.phone ? (
          <View style={styles.callCol}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => onCall(c.phone)}>
              <Ionicons name="call" size={18} color="#0B6E8F" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => onWhatsapp(c.phone)}>
              <Ionicons name="logo-whatsapp" size={18} color="#25A366" />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {canEdit && (
        <View style={styles.actions}>
          {canFeature && (
            <Act icon={c.featured ? "star" : "star-outline"} label={c.featured ? "Unfeature" : "Feature"} color="#C99000" onPress={() => onFeature(c)} />
          )}
          <Act icon="create-outline" label="Edit" color="#0B6E8F" onPress={() => onEdit(c)} />
          <Act icon="trash-outline" label="Delete" color="#8895A0" onPress={() => onDelete(c)} />
        </View>
      )}
    </View>
  );
});

function Seg({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.seg, active && styles.segActive]} onPress={onPress}>
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Chip({ label, active, icon, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      {icon && <Ionicons name={icon} size={13} color={active ? "#fff" : "#0B6E8F"} />}
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Act({ icon, label, color, onPress }) {
  return (
    <TouchableOpacity style={styles.act} onPress={onPress}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[styles.actText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ServiceEditor({ visible, contact, role, onClose, onDone }) {
  const isSuperadmin = role === "superadmin";
  const isAdmin = role === "admin";
  const editing = !!contact;

  const [category, setCategory] = useState(contact?.category || "helpers");
  const [subtype, setSubtype] = useState(contact?.subtype || "");
  const [name, setName] = useState(contact?.name || "");
  const [phone, setPhone] = useState(contact?.phone || "");
  const [altPhone, setAltPhone] = useState(contact?.altPhone || "");
  const [note, setNote] = useState(contact?.note || "");
  // resident: suggest to society vs keep private. admin: society vs personal.
  const [shareSociety, setShareSociety] = useState(
    contact ? contact.scope === "society" : isAdmin ? true : false
  );
  const [busy, setBusy] = useState(false);

  // Reset local state whenever a different contact (or a fresh "add") opens.
  useEffect(() => {
    if (!visible) return;
    setCategory(contact?.category || "helpers");
    setSubtype(contact?.subtype || "");
    setName(contact?.name || "");
    setPhone(contact?.phone || "");
    setAltPhone(contact?.altPhone || "");
    setNote(contact?.note || "");
    setShareSociety(contact ? contact.scope === "society" : isAdmin ? true : false);
  }, [visible, contact, isAdmin]);

  const submit = async () => {
    if (!name.trim()) return Alert.alert("Missing info", "Enter a name / service.");
    if (!phone.trim() && !note.trim()) return Alert.alert("Missing info", "Add a phone number or a note.");
    setBusy(true);
    try {
      const payload = { category, subtype: subtype.trim() || undefined, name: name.trim(), phone: phone.trim() || undefined, altPhone: altPhone.trim() || undefined, note: note.trim() || undefined };
      if (editing) {
        await api.updateService(contact.id, payload);
      } else if (isSuperadmin) {
        await api.createService(payload);
      } else if (isAdmin) {
        await api.createService({ ...payload, scope: shareSociety ? "society" : "personal" });
      } else {
        // resident / guard
        await api.createService({ ...payload, suggest: shareSociety });
      }
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const showShareToggle = !editing && !isSuperadmin;
  const shareLabel = isAdmin
    ? shareSociety
      ? "Visible to all residents in your society"
      : "Saved to your personal contacts only"
    : shareSociety
      ? "Suggest to society (admin will review & publish)"
      : "Save privately to my contacts";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="construct-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{editing ? "Edit contact" : "Add a contact"}</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Category</Label>
            <View style={styles.catPick}>
              {Object.keys(CAT_META).map((id) => (
                <TouchableOpacity key={id} style={[styles.catOpt, category === id && styles.catOptActive]} onPress={() => setCategory(id)}>
                  <Ionicons name={catMeta(id).icon} size={14} color={category === id ? "#fff" : "#0B6E8F"} />
                  <Text style={[styles.catOptText, category === id && { color: "#fff" }]}>{catMeta(id).label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label>Type (optional)</Label>
            <View style={styles.suggestRow}>
              {(SUGGESTIONS[category] || []).map((s) => (
                <TouchableOpacity key={s} style={styles.suggestChip} onPress={() => setSubtype(s)}>
                  <Text style={styles.suggestChipText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} value={subtype} onChangeText={setSubtype} placeholder="e.g. Electrician" />

            <Label>Name *</Label>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Ramesh / City Ambulance" />

            <Label>Phone</Label>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="98765 43210" keyboardType="phone-pad" />

            <Label>Alternate phone (optional)</Label>
            <TextInput style={styles.input} value={altPhone} onChangeText={setAltPhone} placeholder="Optional second number" keyboardType="phone-pad" />

            <Label>Note (optional)</Label>
            <TextInput style={[styles.input, styles.multiline]} value={note} onChangeText={setNote} placeholder="Timings, charges, building, etc." multiline />

            {showShareToggle && (
              <TouchableOpacity style={styles.shareRow} onPress={() => setShareSociety((s) => !s)}>
                <Ionicons name={shareSociety ? "checkbox" : "square-outline"} size={22} color="#0B6E8F" />
                <Text style={styles.shareText}>{shareLabel}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Saving…" : editing ? "Save" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: "#fff", margin: 16, marginBottom: 0, borderRadius: 12, padding: 4 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segActive: { backgroundColor: "#0B6E8F" },
  segText: { color: "#6B7B85", fontWeight: "700", fontSize: 13 },
  segTextActive: { color: "#fff" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", marginHorizontal: 16, marginTop: 12, borderRadius: 12, paddingHorizontal: 14 },
  search: { flex: 1, paddingVertical: 12, fontSize: 15 },
  catBar: { marginTop: 12, maxHeight: 44, flexGrow: 0 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  chipText: { color: "#0B6E8F", fontSize: 12.5, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginBottom: 10, marginTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10 },
  suggestCard: { borderWidth: 1, borderColor: "#F0D9B5", backgroundColor: "#FFFCF5" },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  catIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  name: { fontSize: 15, fontWeight: "800", color: "#1B2B33" },
  sub: { color: "#6B7B85", fontSize: 12.5, marginTop: 2 },
  note: { color: "#48606B", fontSize: 12.5, marginTop: 6, lineHeight: 18 },
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  callCol: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#F1F6F8", alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  act: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EEF4F6", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  actText: { fontWeight: "700", fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { color: "#8895A0", fontSize: 14, fontWeight: "600", textAlign: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  catPick: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catOpt: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  catOptActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  catOptText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  suggestChip: { backgroundColor: "#EAF4F7", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  suggestChipText: { color: "#0B6E8F", fontSize: 11.5, fontWeight: "700" },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 12 },
  shareText: { flex: 1, color: "#1B2B33", fontWeight: "600", fontSize: 13 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
