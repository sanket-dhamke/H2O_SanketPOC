import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal, TextInput } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";
import KeyboardAvoider from "../../components/KeyboardAvoider";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const CATS = ["security", "housekeeping", "maintenance", "utilities", "other"];

export default function VendorsScreen() {
  const navigation = useNavigation();
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.adminVendors();
      setRows(r.vendors || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!vendorName.trim() || !Number(amount)) return Alert.alert("Required", "Vendor name and amount are required.");
    setBusy(true);
    try {
      await api.adminCreateVendor({ vendorName: vendorName.trim(), amount: Number(amount), category, description: description.trim() || undefined, dueDate: dueDate || undefined });
      setOpen(false);
      setVendorName("");
      setAmount("");
      setDescription("");
      setDueDate("");
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const pay = (id) => {
    Alert.alert("Mark paid?", "This adds the amount to society expenses.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark paid",
        onPress: async () => {
          try {
            await api.adminPayVendor(id, {});
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const unpaid = rows.filter((r) => r.status !== "paid").reduce((s, r) => s + r.amount, 0);

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="receipt"
        title="Vendor bills"
        subtitle="Security, housekeeping, AMC"
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={() => setOpen(true)} style={styles.add}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={styles.total}><Text style={styles.totalLabel}>Unpaid</Text><Text style={styles.totalVal}>{money(unpaid)}</Text></View>
        {rows.length === 0 && <Text style={styles.empty}>No vendor bills yet.</Text>}
        {rows.map((v) => (
          <View key={v.id} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.name}>{v.vendorName}</Text>
              <Text style={[styles.status, v.status === "paid" && { color: "#1E7A3D" }]}>{v.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.meta}>{v.category} · {money(v.amount)}{v.dueDate ? ` · due ${v.dueDate}` : ""}</Text>
            {v.description ? <Text style={styles.desc}>{v.description}</Text> : null}
            {v.status !== "paid" ? (
              <TouchableOpacity style={styles.pay} onPress={() => pay(v.id)}>
                <Text style={styles.payText}>Mark paid</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </ScrollView>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoider style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New vendor bill</Text>
            <TextInput style={styles.input} placeholder="Vendor name" value={vendorName} onChangeText={setVendorName} />
            <TextInput style={styles.input} placeholder="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <View style={styles.cats}>
              {CATS.map((c) => (
                <TouchableOpacity key={c} style={[styles.cat, category === c && styles.catOn]} onPress={() => setCategory(c)}>
                  <Text style={[styles.catText, category === c && { color: "#fff" }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Due date YYYY-MM-DD (optional)" value={dueDate} onChangeText={setDueDate} />
            <TextInput style={styles.input} placeholder="Description (optional)" value={description} onChangeText={setDescription} />
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 10 }}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={submit} disabled={busy} style={styles.save}><Text style={{ color: "#fff", fontWeight: "800" }}>{busy ? "Saving…" : "Save"}</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  add: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  total: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontWeight: "700", color: "#6B7B85" },
  totalVal: { fontWeight: "800", fontSize: 18, color: "#B42318" },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 20 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10 },
  top: { flexDirection: "row", justifyContent: "space-between" },
  name: { fontWeight: "800", fontSize: 16, color: "#1B2B33" },
  status: { fontWeight: "800", fontSize: 11, color: "#C2571A" },
  meta: { color: "#6B7B85", marginTop: 4 },
  desc: { color: "#48606B", marginTop: 6 },
  pay: { marginTop: 10, alignSelf: "flex-start", backgroundColor: "#EAF4F7", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  payText: { color: "#0B6E8F", fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  modalTitle: { fontWeight: "800", fontSize: 18, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, padding: 12, marginTop: 8, backgroundColor: "#F8FAFB" },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  cat: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  catOn: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  catText: { fontSize: 12, fontWeight: "700", color: "#0B6E8F" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 14 },
  save: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
});
