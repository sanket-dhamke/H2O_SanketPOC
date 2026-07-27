import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
} from "react-native";
import TextInput from "../../components/AppTextInput";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor, isPreschool } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";

export default function ManageFlatsScreen({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const preschool = isPreschool(user);
  const classOptions = L.classOptions || [];
  const [flats, setFlats] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [flatNo, setFlatNo] = useState("");
  const [block, setBlock] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [editFlat, setEditFlat] = useState(null); // society: occupancy/rent editor

  const load = useCallback(async () => {
    try {
      const { flats } = await api.adminListFlats();
      setFlats(flats);
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

  const addFlat = async () => {
    if (!flatNo.trim()) {
      Alert.alert("Missing info", "Flat number is required.");
      return;
    }
    setBusy(true);
    try {
      await api.adminCreateFlat({
        flatNo: flatNo.trim(),
        block: block.trim(),
        ownerName: ownerName.trim(),
        guardianName: guardianName.trim(),
        guardianPhone: guardianPhone.trim(),
        guardianEmail: guardianEmail.trim(),
      });
      setFlatNo("");
      setBlock("");
      setOwnerName("");
      setGuardianName("");
      setGuardianPhone("");
      setGuardianEmail("");
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="business"
        title={L.units}
        subtitle={`Add & view ${L.units.toLowerCase()}`}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate("Onboarding")}
            style={styles.bulkBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="construct-outline" size={18} color="#fff" />
            <Text style={styles.bulkText}>Bulk setup</Text>
          </TouchableOpacity>
        }
      />
      <View style={styles.form}>
        <Text style={styles.formTitle}>Add a {L.unit.toLowerCase()}</Text>
        {preschool ? (
          <>
            <TextInput style={styles.input} value={flatNo} onChangeText={setFlatNo} placeholder="Student name / roll no" />
            {classOptions.length > 0 && (
              <View style={styles.classRow}>
                {classOptions.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.classChip, block === c && styles.classChipActive]}
                    onPress={() => setBlock(block === c ? "" : c)}
                  >
                    <Text style={[styles.classChipText, block === c && styles.classChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput style={styles.input} value={guardianName} onChangeText={setGuardianName} placeholder="Guardian / parent name" />
            <View style={styles.formRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={guardianPhone} onChangeText={setGuardianPhone} placeholder="Guardian phone (for reminders)" keyboardType="phone-pad" />
            </View>
            <TextInput style={styles.input} value={guardianEmail} onChangeText={setGuardianEmail} placeholder="Guardian email (optional)" autoCapitalize="none" keyboardType="email-address" />
          </>
        ) : (
          <>
            <View style={styles.formRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={flatNo} onChangeText={setFlatNo} placeholder={L.unit + " no (A-101)"} autoCapitalize="characters" />
              <TextInput style={[styles.input, { width: 80 }]} value={block} onChangeText={setBlock} placeholder={L.wing} autoCapitalize="characters" />
            </View>
            <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName} placeholder="Owner name (optional)" />
          </>
        )}
        <TouchableOpacity style={[styles.addBtn, busy && { opacity: 0.6 }]} onPress={addFlat} disabled={busy}>
          <Text style={styles.addBtnText}>{busy ? "Adding..." : `Add ${L.unit.toLowerCase()}`}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={flats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          !preschool ? (
            <TouchableOpacity style={styles.agreementsLink} onPress={() => navigation.navigate("RentAgreements")}>
              <Ionicons name="document-text-outline" size={18} color="#0B6E8F" />
              <Text style={styles.agreementsLinkText}>Rent agreements — verify & track expiry</Text>
              <Ionicons name="chevron-forward" size={18} color="#0B6E8F" />
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>No {L.units.toLowerCase()} yet.</Text>}
        renderItem={({ item }) => {
          const rented = item.occupancy === "rented";
          const Wrapper = preschool ? View : TouchableOpacity;
          return (
            <Wrapper
              style={styles.card}
              {...(!preschool ? { onPress: () => setEditFlat(item), activeOpacity: 0.7 } : {})}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.flatTop}>
                  <Text style={styles.flatNo}>{item.flatNo}{item.block ? `  ·  ${item.block}` : ""}</Text>
                  {!preschool && (
                    <View style={[styles.occBadge, rented ? styles.occRented : styles.occOwner]}>
                      <Text style={[styles.occText, rented ? styles.occTextRented : styles.occTextOwner]}>
                        {rented ? "RENTED" : "OWNER"}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>
                  {preschool
                    ? `${item.guardianName || "No guardian set"}${item.guardianPhone ? ` · ${item.guardianPhone}` : ""}`
                    : `${item.ownerName ? item.ownerName : "No owner set"} · ${item.residentCount} resident(s)`}
                </Text>
                {!preschool && rented && (
                  <Text style={styles.rentMeta}>
                    {item.rentMaintenanceAmount != null ? `Maintenance ₹${Number(item.rentMaintenanceAmount).toLocaleString("en-IN")}` : "Standard maintenance"}
                    {item.agreementStatus ? `  ·  agreement: ${item.agreementStatus}${item.agreementEndDate ? ` (till ${item.agreementEndDate})` : ""}` : "  ·  no agreement yet"}
                  </Text>
                )}
              </View>
              {!preschool && <Ionicons name="create-outline" size={18} color="#93A2AB" />}
            </Wrapper>
          );
        }}
      />

      {!preschool && (
        <OccupancyModal
          flat={editFlat}
          onClose={() => setEditFlat(null)}
          onSaved={async () => { setEditFlat(null); await load(); }}
        />
      )}
    </View>
  );
}

// Society-only: mark a flat owner/rented and set a rent-specific maintenance amount.
function OccupancyModal({ flat, onClose, onSaved }) {
  const visible = !!flat;
  const [occupancy, setOccupancy] = useState("owner");
  const [rentAmt, setRentAmt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (flat) {
      setOccupancy(flat.occupancy === "rented" ? "rented" : "owner");
      setRentAmt(flat.rentMaintenanceAmount != null ? String(flat.rentMaintenanceAmount) : "");
    }
  }, [flat]);

  const save = async () => {
    setBusy(true);
    try {
      await api.adminUpdateFlat(flat.id, {
        occupancy,
        rentMaintenanceAmount: occupancy === "rented" && rentAmt !== "" ? Number(rentAmt) : null,
      });
      await onSaved();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{flat?.flatNo} · occupancy</Text>
          <View style={styles.segRow}>
            {["owner", "rented"].map((o) => (
              <TouchableOpacity key={o} style={[styles.seg, occupancy === o && styles.segActive]} onPress={() => setOccupancy(o)}>
                <Text style={[styles.segText, occupancy === o && styles.segTextActive]}>{o === "owner" ? "Owner-occupied" : "Rented"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {occupancy === "rented" && (
            <>
              <Text style={styles.modalLabel}>Monthly maintenance for this rented flat (₹)</Text>
              <TextInput style={styles.input} value={rentAmt} onChangeText={setRentAmt} keyboardType="number-pad" placeholder="Leave blank to use the standard amount" />
              <Text style={styles.modalHint}>Used automatically when you generate monthly bills. The tenant can then submit a rent agreement from their app for you to verify.</Text>
            </>
          )}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addBtn, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}>
              <Text style={styles.addBtnText}>{busy ? "Saving…" : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  bulkBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  bulkText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  form: { backgroundColor: "#fff", padding: 16, borderBottomWidth: 1, borderBottomColor: "#E6EDF0" },
  formTitle: { fontSize: 16, fontWeight: "800", color: "#1B2B33", marginBottom: 10 },
  formRow: { flexDirection: "row", gap: 10 },
  classRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  classChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: "#F1F5F7", borderWidth: 1, borderColor: "#D6DEE3" },
  classChipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  classChipText: { color: "#334", fontWeight: "600", fontSize: 13 },
  classChipTextActive: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB", marginBottom: 10 },
  addBtn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  addBtnText: { color: "#fff", fontWeight: "700" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 10 },
  flatTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  flatNo: { fontSize: 16, fontWeight: "700", color: "#1B2B33" },
  meta: { color: "#6B7B85", marginTop: 2, fontSize: 13 },
  rentMeta: { color: "#B0620B", marginTop: 4, fontSize: 12, fontWeight: "600" },
  occBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  occOwner: { backgroundColor: "#EEF2F4" },
  occRented: { backgroundColor: "#FEF3E2" },
  occText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  occTextOwner: { color: "#6B7B85" },
  occTextRented: { color: "#B0620B" },
  agreementsLink: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EAF4F8", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14 },
  agreementsLinkText: { flex: 1, color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 40 },
  overlay: { flex: 1, backgroundColor: "rgba(6,20,26,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#1B2B33", marginBottom: 14 },
  modalLabel: { fontSize: 13, fontWeight: "700", color: "#42525B", marginTop: 6, marginBottom: 6 },
  modalHint: { color: "#8895A0", fontSize: 12, marginTop: 8 },
  segRow: { flexDirection: "row", gap: 10 },
  seg: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#D6DEE3", alignItems: "center", backgroundColor: "#F8FAFB" },
  segActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  segText: { color: "#42525B", fontWeight: "700" },
  segTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, backgroundColor: "#EEF2F4", alignItems: "center" },
  cancelText: { color: "#42525B", fontWeight: "700" },
});
