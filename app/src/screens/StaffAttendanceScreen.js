import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isPreschool } from "../lib/org";
import { mergeHelperDirectory, retainInside } from "../lib/helperGate";
import { fetchDirectory, fetchGateAttendance, peekDirectory, readCachedDirectory, rememberDirectory } from "../lib/gateDirectory";
import { formatHours, periodBounds, summarizeVisits, visitsInPeriod } from "../lib/attendancePeriod";
import ScreenHeader from "../components/ScreenHeader";
import OptionalPhoto from "../components/OptionalPhoto";
import ModalClose from "../components/ModalClose";

// One directory for everyone who comes through the gate and is not a visitor.
// Staff and helpers share the list. The role sits on the person, not on a tab.
// Registering adds them. It does not check them in.
const PRESCHOOL_ROLES = ["Teacher", "Helper", "Security", "Admin", "Other"];
const SOCIETY_ROLES = ["Security / guard", "Housekeeping", "Gardener", "Technician", "Office", "Other"];
const HELPER_ROLES = ["Maid", "Cook", "Driver", "Nanny", "Car cleaner", "Gardener", "Other"];

const KIND_LABEL = {
  staff: "Staff",
  helpers: "Helper",
  trades: "Home service",
  medical: "Medical",
  utilities: "Utility",
  lifestyle: "Lifestyle",
};

const timeAt = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

const kindOf = (category) => KIND_LABEL[category] || "Helper";

export default function StaffAttendanceScreen() {
  const { user } = useAuth();
  const preschool = isPreschool(user);

  const [today, setToday] = useState({ records: [], onPremise: 0, total: 0 });
  const [directory, setDirectory] = useState(() => peekDirectory(user?.id) || []);
  const [waiting, setWaiting] = useState(() => !(peekDirectory(user?.id)?.length));
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [history, setHistory] = useState(null);
  const [pending, setPending] = useState(null);
  const [snap, setSnap] = useState(null);
  const [snapError, setSnapError] = useState("");

  const load = useCallback(async () => {
    const userId = user?.id;
    const cached = peekDirectory(userId) || (await readCachedDirectory(userId));
    if (cached?.length) {
      setDirectory((current) => (current.length ? current : cached));
      setWaiting(false);
    }
    let workers = [];
    try {
      workers = await fetchDirectory(userId);
    } catch {
      workers = cached || [];
    }
    if (!workers.length && !cached?.length) {
      setWaiting(false);
      return;
    }
    setDirectory((current) => retainInside(mergeHelperDirectory(workers, []), current.length ? current : cached || []));
    setWaiting(false);
    const attendance = await fetchGateAttendance(workers);
    const rows = mergeHelperDirectory(workers, attendance?.records || []);
    setToday({
      records: attendance?.records || [],
      onPremise: attendance?.onPremise || 0,
      total: attendance?.total || 0,
    });
    setDirectory(rows);
    rememberDirectory(userId, rows);
  }, [user?.id]);

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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return directory
      .filter((worker) => {
        if (!q) return true;
        const kind = kindOf(worker.category);
        return `${worker.name} ${worker.phone || ""} ${worker.subtype || ""} ${kind}`.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(!!b.inside) - Number(!!a.inside) || String(a.name).localeCompare(String(b.name)));
  }, [directory, query]);

  const showNotice = (message) => setNotice(message || "");

  const beginGate = (person, action, attendanceId) => {
    setPending({ id: person.id, name: person.name, action, attendanceId: attendanceId || null });
    setSnap(null);
    setSnapError("");
    showNotice("");
  };

  const confirmGate = async () => {
    if (!pending || busy) return;
    setBusy(true);
    showNotice("");
    try {
      const photoBase64 = snap?.base64 || undefined;
      if (pending.action === "in") {
        const r = await api.workerCheckIn(pending.id, { photoBase64 });
        const created = r?.attendance;
        setDirectory((rows) =>
          rows.map((row) =>
            row.id === pending.id
              ? { ...row, inside: true, attendanceId: created?.id || row.attendanceId, inAt: created?.inAt || new Date().toISOString() }
              : row
          )
        );
        if (r?.alreadyIn) showNotice(`${pending.name} is already inside.`);
      } else {
        await api.workerCheckOut(pending.attendanceId, { photoBase64 });
        setDirectory((rows) =>
          rows.map((row) => (row.attendanceId === pending.attendanceId ? { ...row, inside: false, attendanceId: null, inAt: null } : row))
        );
      }
      setPending(null);
      setSnap(null);
      await load();
    } catch (e) {
      setSnapError(e.message || "Could not update attendance.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="id-card"
        title="Staff & helpers"
        subtitle={`${today.onPremise || 0} on premise · ${today.total || 0} today`}
      />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.form}>
            <Text style={styles.formHint}>
              Everyone registered is on this list. Tap a name for today, this week, or this month. A photo on check-in is optional.
            </Text>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color="#8895A0" />
              <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search name, phone or role" />
            </View>
            <TouchableOpacity style={styles.registerLink} onPress={() => setRegisterOpen(true)}>
              <Ionicons name="person-add-outline" size={16} color="#0B6E8F" />
              <Text style={styles.registerLinkText}>Add a person</Text>
              <Ionicons name="chevron-forward" size={16} color="#0B6E8F" />
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {waiting ? "Loading registered people…" : query.trim() ? `No match for “${query.trim()}”.` : "No one is registered yet."}
          </Text>
        }
        renderItem={({ item }) => {
          const photo =
            (typeof item.photoUrl === "string" && item.photoUrl) ||
            (typeof item.inPhotoUrl === "string" && item.inPhotoUrl) ||
            null;
          const role = item.subtype || item.role || "";
          return (
            <View style={styles.card}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name?.charAt(0)?.toUpperCase() || "?"}</Text>
                </View>
              )}
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setHistory(item)}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {kindOf(item.category)}
                  {role ? ` · ${role}` : ""}
                  {item.phone ? ` · ${item.phone}` : ""}
                  {item.inside && item.inAt ? ` · In ${timeAt(item.inAt)}` : ""}
                  {item.inside ? " · Inside" : " · Not in"}
                </Text>
              </TouchableOpacity>
              {item.inside ? (
                <TouchableOpacity style={styles.outBtn} onPress={() => beginGate(item, "out", item.attendanceId)} disabled={busy}>
                  <Text style={styles.outText}>Check out</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.inBtn, busy && { opacity: 0.5 }]} onPress={() => beginGate(item, "in")} disabled={busy}>
                  <Text style={styles.inBtnText}>Check in</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
      <PersonHistory person={history} onClose={() => setHistory(null)} />
      <RegisterPerson
        visible={registerOpen}
        preschool={preschool}
        onClose={() => setRegisterOpen(false)}
        onDone={async (message) => {
          setRegisterOpen(false);
          setQuery("");
          showNotice(message);
          await load();
        }}
      />
      {pending ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => { setPending(null); setSnap(null); }}>
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={[styles.formTitle, { flex: 1 }]}>
                  {pending.action === "in" ? "Check in" : "Check out"} {pending.name}
                </Text>
                <ModalClose light={false} onPress={() => { setPending(null); setSnap(null); }} />
              </View>
              <Text style={styles.formHint}>A photo helps recognise them at the gate. Skip it and the check-in or check-out still saves.</Text>
              <OptionalPhoto value={snap} onChange={setSnap} onError={setSnapError} />
              {snapError ? <Text style={styles.error}>{snapError}</Text> : null}
              <View style={styles.pendingActions}>
                <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={confirmGate} disabled={busy}>
                  <Text style={styles.primaryBtnText}>{busy ? "Saving…" : pending.action === "in" ? "Confirm check in" : "Confirm check out"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quietBtn} onPress={() => { setPending(null); setSnap(null); }}>
                  <Text style={styles.quietText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const PERIODS = [
  { id: "day", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

function PersonHistory({ person, onClose }) {
  const [period, setPeriod] = useState("day");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!person?.id) return;
    let cancel = false;
    setPeriod("day");
    setRows([]);
    setError("");
    setLoading(true);
    const month = periodBounds("month");
    api.workerAttendance(person.id, { from: month.from, to: month.to })
      .then((res) => {
        if (!cancel) setRows(res.attendance || []);
      })
      .catch((e) => {
        if (!cancel) setError(e.message || "Could not load their visits.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [person?.id]);

  const shown = visitsInPeriod(rows, period);
  const summary = summarizeVisits(shown);
  const summaryText = loading
    ? "Loading their visits…"
    : `${summary.days} day${summary.days === 1 ? "" : "s"} · ${summary.visits} visit${summary.visits === 1 ? "" : "s"}${summary.minutes ? ` · ${formatHours(summary.minutes)}` : ""}${summary.open ? ` · ${summary.open} still inside` : ""}`;

  return (
    <Modal visible={!!person} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={[styles.formTitle, { flex: 1 }]}>{person?.name || "Attendance"}</Text>
            <ModalClose light={false} onPress={onClose} />
          </View>
          <Text style={styles.formHint}>
            {kindOf(person?.category)}
            {person?.subtype ? ` · ${person.subtype}` : ""}
            {person?.phone ? ` · ${person.phone}` : ""}
          </Text>
          <View style={styles.roleRow}>
            {PERIODS.map((item) => (
              <TouchableOpacity key={item.id} style={[styles.roleChip, period === item.id && styles.roleChipActive]} onPress={() => setPeriod(item.id)}>
                <Text style={[styles.roleText, period === item.id && { color: "#fff" }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.summary}>{summaryText}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
            {!loading && shown.length === 0 ? <Text style={styles.empty}>No visits in this period.</Text> : null}
            {shown.map((row) => (
              <View key={row.id} style={styles.visit}>
                <Text style={styles.name}>{row.date}</Text>
                <Text style={styles.meta}>
                  In {timeAt(row.inAt)}
                  {row.outAt ? ` · Out ${timeAt(row.outAt)}` : " · Still inside"}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RegisterPerson({ visible, preschool, onClose, onDone }) {
  const kinds = preschool
    ? [{ id: "staff", label: "Staff", roles: PRESCHOOL_ROLES }]
    : [
        { id: "helpers", label: "Helper", roles: HELPER_ROLES },
        { id: "staff", label: "Staff", roles: SOCIETY_ROLES },
      ];
  const [kind, setKind] = useState(kinds[0].id);
  const roles = kinds.find((item) => item.id === kind)?.roles || kinds[0].roles;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(roles[0]);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setKind(kinds[0].id);
    setName("");
    setPhone("");
    setRole(kinds[0].roles[0]);
    setPhoto(null);
    setError("");
  }, [visible, preschool]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Enter their name.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setError("A 10-digit phone is how we recognise them next time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api.registerWorker({
        name: name.trim(),
        phone,
        category: kind,
        subtype: role,
        photoUrl: photo?.base64 || undefined,
      });
      setName("");
      setPhone("");
      setPhoto(null);
      onDone(r.existed ? `${r.worker.name} is already registered. Check them in from the list.` : `${r.worker.name} is registered. Check them in from the list when they arrive.`);
    } catch (e) {
      setError(e.message || "Could not register.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={[styles.formTitle, { flex: 1 }]}>Add a person</Text>
            <ModalClose light={false} onPress={onClose} />
          </View>
          <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.formHint}>This only adds them to the list. It does not check them in. Photo is optional.</Text>
          <View style={styles.roleRow}>
            {kinds.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.roleChip, kind === item.id && styles.roleChipActive]}
                onPress={() => {
                  setKind(item.id);
                  setRole(item.roles[0]);
                }}
              >
                <Text style={[styles.roleText, kind === item.id && { color: "#fff" }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" />
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="10-digit phone" keyboardType="phone-pad" />
          <View style={styles.roleRow}>
            {roles.map((item) => (
              <TouchableOpacity key={item} style={[styles.roleChip, role === item && styles.roleChipActive]} onPress={() => setRole(item)}>
                <Text style={[styles.roleText, role === item && { color: "#fff" }]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <OptionalPhoto value={photo} onChange={setPhoto} onError={setError} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.pendingActions}>
            <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
              <Text style={styles.primaryBtnText}>{busy ? "Saving…" : "Register"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quietBtn} onPress={onClose}>
              <Text style={styles.quietText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  notice: { color: "#0B6E8F", fontWeight: "700", fontSize: 13, lineHeight: 18, marginHorizontal: 16, marginTop: 10 },
  error: { color: "#B42318", fontWeight: "700", fontSize: 13, marginTop: 8 },
  form: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 14 },
  formTitle: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  formHint: { fontSize: 12.5, color: "#6B7B85", lineHeight: 18, marginTop: 4, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB", marginBottom: 10 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  roleChip: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  roleChipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  roleText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13 },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#D6DEE3", backgroundColor: "#F8FAFB", borderRadius: 10, paddingHorizontal: 12 },
  search: { flex: 1, paddingVertical: 11, fontSize: 15 },
  inBtn: { backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  inBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  registerLink: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EAF4F8", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  registerLinkText: { flex: 1, color: "#0B3A49", fontWeight: "700", fontSize: 12.5 },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 20 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 10 },
  avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#E7F3F8", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { color: "#0B6E8F", fontWeight: "800" },
  pendingActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  quietBtn: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  quietText: { color: "#5C7380", fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(15, 30, 40, 0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, maxHeight: "90%" },
  modalHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 16, fontWeight: "700", color: "#1B2B33" },
  meta: { color: "#6B7B85", marginTop: 2, fontSize: 13 },
  summary: { color: "#1B2B33", fontWeight: "700", fontSize: 13, marginBottom: 8 },
  visit: { borderTopWidth: 1, borderTopColor: "#E6EEF2", paddingVertical: 10 },
  outBtn: { borderWidth: 1, borderColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  outText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
});
