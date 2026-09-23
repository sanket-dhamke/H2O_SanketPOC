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
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isPreschool } from "../lib/org";
import { indiaDate, insideVisits, mergeHelperDirectory } from "../lib/helperGate";
import ScreenHeader from "../components/ScreenHeader";
import OptionalPhoto from "../components/OptionalPhoto";
import ModalClose from "../components/ModalClose";

// Two kinds of people come through the gate, and neither is a visitor:
//   Staff   — guards and the society's or school's own people. Registered once,
//             then checked in and out from this list.
//   Helpers — maids, cooks, drivers and vendors. Same list, then check-in
//             and check-out. Registering never marks them present.
const PRESCHOOL_ROLES = ["Teacher", "Helper", "Security", "Admin", "Other"];
const SOCIETY_ROLES = ["Security / guard", "Housekeeping", "Gardener", "Technician", "Office", "Other"];

const timeAt = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

// The hosted gate server may not have the one-list attendance route yet.
// The directory and each helper's own log are older and still answer.
async function loadPeople(category) {
  const workers = await api.workers({ category }).then((r) => r.workers || []).catch(() => []);
  try {
    const today = await api.workerAttendanceToday(indiaDate());
    const mine = new Set(workers.map((worker) => worker.id));
    const records = (today.records || []).filter((row) => row.category === category || mine.has(row.workerId));
    return {
      workers,
      today: {
        ...today,
        records,
        onPremise: records.filter((row) => !row.outAt).length,
        total: records.length,
      },
    };
  } catch (e) {
    const missing = /404|failed \(404\)|Cannot GET/i.test(e.message || "");
    if (!missing) return { workers, today: { records: [], onPremise: 0, total: 0 } };
    const date = indiaDate();
    const lists = await Promise.all(
      workers.slice(0, 40).map(async (worker) => {
        try {
          const res = await api.workerAttendance(worker.id);
          return (res.attendance || [])
            .filter((row) => row.date === date)
            .map((row) => ({
              id: row.id,
              workerId: worker.id,
              name: worker.name,
              phone: worker.phone || null,
              category: worker.category || null,
              subtype: worker.subtype || null,
              photoUrl: worker.photoUrl || null,
              inPhotoUrl: row.inPhotoUrl || null,
              outPhotoUrl: row.outPhotoUrl || null,
              inAt: row.inAt,
              outAt: row.outAt,
            }));
        } catch {
          return [];
        }
      })
    );
    const records = lists.flat();
    return {
      workers,
      today: {
        date,
        records,
        onPremise: records.filter((row) => !row.outAt).length,
        total: records.length,
      },
    };
  }
}

export default function StaffAttendanceScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const preschool = isPreschool(user);
  const roles = preschool ? PRESCHOOL_ROLES : SOCIETY_ROLES;

  const [tab, setTab] = useState("staff");
  const [staff, setStaff] = useState({ records: [], onPremise: 0, total: 0 });
  const [helpers, setHelpers] = useState({ records: [], onPremise: 0, total: 0 });
  const [staffDirectory, setStaffDirectory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState([]);
  const [helperView, setHelperView] = useState("directory");
  const [staffView, setStaffView] = useState("directory");
  const [notice, setNotice] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [snap, setSnap] = useState(null);
  const [snapError, setSnapError] = useState("");

  const load = useCallback(async () => {
    const [staffGate, helperGate] = await Promise.all([loadPeople("staff"), loadPeople("helpers")]);
    if (staffGate) {
      setStaff(staffGate.today);
      setStaffDirectory(mergeHelperDirectory(staffGate.workers, staffGate.today.records));
    }
    if (helperGate) {
      setHelpers(helperGate.today);
      setDirectory(mergeHelperDirectory(helperGate.workers, helperGate.today.records));
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

  const inside = useMemo(() => insideVisits(helpers.records), [helpers.records]);
  const staffInside = useMemo(() => insideVisits(staff.records), [staff.records]);
  const shownHelpers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = directory.filter((worker) => {
      if (!q) return true;
      return `${worker.name} ${worker.phone || ""} ${worker.subtype || ""}`.toLowerCase().includes(q);
    });
    return rows;
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
        if (r?.alreadyIn) showNotice(`${pending.name} is already inside.`);
      } else {
        await api.workerCheckOut(pending.attendanceId, { photoBase64 });
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

  const shownStaff = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staffDirectory.filter((worker) => {
      if (!q) return true;
      return `${worker.name} ${worker.phone || ""} ${worker.subtype || ""}`.toLowerCase().includes(q);
    });
  }, [staffDirectory, query]);

  const staffTab = tab === "staff";
  const view = staffTab ? staffView : helperView;
  const rows = staffTab ? (staffView === "inside" ? staffInside : shownStaff) : helperView === "inside" ? inside : shownHelpers;
  const peopleCount = staffTab ? staffDirectory.length : directory.length;
  const insideCount = staffTab ? staffInside.length : inside.length;

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="id-card"
        title="Staff & helpers"
        subtitle={`${staff.onPremise + helpers.onPremise} on premise · ${staff.total + helpers.total} today`}
      />

      <View style={styles.segment}>
        <Seg
          label={`${preschool ? "Staff" : "Society staff"}${staff.onPremise ? ` (${staff.onPremise})` : ""}`}
          active={staffTab}
          onPress={() => setTab("staff")}
        />
        <Seg
          label={`Helpers${helpers.onPremise ? ` (${helpers.onPremise})` : ""}`}
          active={!staffTab}
          onPress={() => setTab("helpers")}
        />
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.form}>
            <View style={styles.subSeg}>
              <Seg
                label={`${staffTab ? "All staff" : "All helpers"}${peopleCount ? ` (${peopleCount})` : ""}`}
                active={view === "directory"}
                onPress={() => (staffTab ? setStaffView("directory") : setHelperView("directory"))}
              />
              <Seg
                label={`Inside${insideCount ? ` (${insideCount})` : ""}`}
                active={view === "inside"}
                onPress={() => (staffTab ? setStaffView("inside") : setHelperView("inside"))}
              />
            </View>
            <Text style={styles.formHint}>
              {view === "inside"
                ? "Who is inside now. Check them out when they leave. A photo is optional."
                : staffTab
                  ? "Guards and working staff, registered once. Check them in from this list. A photo is optional."
                  : "Helpers, registered once. Check them in from this list. Registering does not check them in. A photo is optional."}
            </Text>
            {view === "directory" ? (
              <>
                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={18} color="#8895A0" />
                  <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search name or phone" />
                </View>
                <TouchableOpacity style={styles.registerLink} onPress={() => setRegisterOpen(true)}>
                  <Ionicons name="person-add-outline" size={16} color="#0B6E8F" />
                  <Text style={styles.registerLinkText}>{staffTab ? "Register a guard or staff member" : "Register a new helper"}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#0B6E8F" />
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {view === "inside"
              ? `Nobody is inside. Open All ${staffTab ? "staff" : "helpers"} to check someone in.`
              : query.trim()
                ? `No match for “${query.trim()}”.`
                : staffTab
                  ? "No guards or staff registered yet."
                  : "No helpers registered yet."}
          </Text>
        }
        renderItem={({ item }) => {
          const visitId = view === "inside" ? item.id : item.attendanceId;
          const isInside = view === "inside" || item.inside;
          const photo =
            (typeof item.photoUrl === "string" && item.photoUrl) ||
            (typeof item.inPhotoUrl === "string" && item.inPhotoUrl) ||
            null;
          return (
            <View style={styles.card}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name?.charAt(0)?.toUpperCase() || "?"}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.subtype || item.role || item.category || (staffTab ? "Staff" : "Helper")}
                  {item.phone ? ` · ${item.phone}` : ""}
                  {item.inAt ? ` · In ${timeAt(item.inAt)}` : ""}
                  {item.outAt ? ` · Out ${timeAt(item.outAt)}` : ""}
                  {view === "directory" && !item.inside ? " · Not in" : ""}
                </Text>
              </View>
              {isInside ? (
                <TouchableOpacity style={styles.outBtn} onPress={() => beginGate(item, "out", visitId)} disabled={busy}>
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
      <RegisterPerson
        visible={registerOpen}
        category={staffTab ? "staff" : "helpers"}
        roles={roles}
        title={staffTab ? "Register staff" : "Register a helper"}
        onClose={() => setRegisterOpen(false)}
        onDone={async (message) => {
          setRegisterOpen(false);
          showNotice(message);
          setStaffView("directory");
          setHelperView("directory");
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

function RegisterPerson({ visible, category, roles, title, onClose, onDone }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(roles[0]);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setName("");
    setPhone("");
    setRole(roles[0]);
    setPhoto(null);
    setError("");
  }, [visible, roles]);

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
        category,
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
            <Text style={[styles.formTitle, { flex: 1 }]}>{title}</Text>
            <ModalClose light={false} onPress={onClose} />
          </View>
          <Text style={styles.formHint}>This only adds them to the list. It does not check them in. Photo is optional.</Text>
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
        </View>
      </View>
    </Modal>
  );
}

function Seg({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.seg, active && styles.segActive]} onPress={onPress}>
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  segment: { flexDirection: "row", backgroundColor: "#fff", margin: 16, marginBottom: 0, borderRadius: 12, padding: 4 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segActive: { backgroundColor: "#0B6E8F" },
  segText: { color: "#6B7B85", fontWeight: "700", fontSize: 13 },
  segTextActive: { color: "#fff" },
  notice: { color: "#0B6E8F", fontWeight: "700", fontSize: 13, lineHeight: 18, marginHorizontal: 16, marginTop: 10 },
  error: { color: "#B42318", fontWeight: "700", fontSize: 13, marginTop: 8 },
  subSeg: { flexDirection: "row", backgroundColor: "#F1F5F7", borderRadius: 10, padding: 3, marginBottom: 10 },
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
  searchBtn: { backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchEmpty: { color: "#8895A0", fontSize: 12.5, marginTop: 10 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "#EDF2F4", paddingTop: 12, marginTop: 12 },
  inBtn: { backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  inBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  registerLink: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EAF4F8", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  registerLinkText: { flex: 1, color: "#0B3A49", fontWeight: "700", fontSize: 12.5 },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 20 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 10 },
  avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#E7F3F8", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { color: "#0B6E8F", fontWeight: "800" },
  pending: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#E6EEF2", paddingTop: 12 },
  pendingActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  quietBtn: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  quietText: { color: "#5C7380", fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(15, 30, 40, 0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  modalHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 16, fontWeight: "700", color: "#1B2B33" },
  meta: { color: "#6B7B85", marginTop: 2, fontSize: 13 },
  outBtn: { borderWidth: 1, borderColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  outText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  doneBadge: { backgroundColor: "#EEF2F4", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  doneText: { color: "#8895A0", fontWeight: "700", fontSize: 13 },
});
