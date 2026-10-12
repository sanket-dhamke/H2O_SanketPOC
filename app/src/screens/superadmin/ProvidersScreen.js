import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import ScreenHeader from "../../components/ScreenHeader";
import TextInput from "../../components/AppTextInput";
import { api } from "../../lib/api";
import { body, head } from "../../lib/type";

const empty = { name: "", email: "", phone: "", password: "Password123", packAmount: "4999", serviceSlugs: [], fallback: false };

export default function ProvidersScreen() {
  const [rows, setRows] = useState([]);
  const [services, setServices] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState("all");
  const [phoneEdit, setPhoneEdit] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await api.ownerProviders();
    setRows(res.providers || []);
    setServices(res.services || []);
    setRevenue(res.revenue || 0);
  }, []);

  useFocusEffect(useCallback(() => { load().catch((e) => Alert.alert("Providers", e.message)); }, [load]));

  const toggleSlug = (slug) => {
    setForm((f) => ({
      ...f,
      serviceSlugs: f.serviceSlugs.includes(slug) ? f.serviceSlugs.filter((s) => s !== slug) : [...f.serviceSlugs, slug],
    }));
  };

  const create = async () => {
    try {
      await api.ownerCreateProvider({ ...form, packAmount: Number(form.packAmount) });
      setForm(empty);
      await load();
    } catch (e) {
      Alert.alert("Could not add", e.message);
    }
  };

  const shown = rows.filter((p) => filter === "all" || p.serviceSlugs.includes(filter) || (filter === "desk" && p.fallback));

  return (
    <View style={styles.container}>
      <ScreenHeader icon="people" title="Service professionals" subtitle={`Annual pack collected ₹${Number(revenue).toLocaleString("en-IN")}`} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={styles.note}>
          Only the GATEZO owner adds, edits or removes professional logins. Each one pays an annual pack (default ₹4,999) before they receive jobs. The house desk is exempt and accepts a job only after every other free professional ignores the 60-second offer.
        </Text>

        <Text style={styles.h}>Add a professional</Text>
        <TextInput style={styles.input} placeholder="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
        <TextInput style={styles.input} placeholder="Email login" autoCapitalize="none" value={form.email} onChangeText={(email) => setForm({ ...form, email })} />
        <TextInput style={styles.input} placeholder="Phone" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} />
        <TextInput style={styles.input} placeholder="Password" value={form.password} onChangeText={(password) => setForm({ ...form, password })} />
        <TextInput style={styles.input} placeholder="Annual pack ₹" keyboardType="number-pad" value={form.packAmount} onChangeText={(packAmount) => setForm({ ...form, packAmount })} />
        <View style={styles.chips}>
          {services.map((s) => {
            const on = form.serviceSlugs.includes(s.slug);
            return (
              <TouchableOpacity key={s.slug} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleSlug(s.slug)}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={styles.check} onPress={() => setForm({ ...form, fallback: !form.fallback })}>
          <Text style={styles.checkText}>{form.fallback ? "☑" : "☐"} House desk (accepts only if nobody else does)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primary} onPress={create}>
          <Text style={styles.primaryText}>Create login</Text>
        </TouchableOpacity>

        <Text style={styles.h}>Roster</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <TouchableOpacity style={[styles.chip, filter === "all" && styles.chipOn]} onPress={() => setFilter("all")}>
            <Text style={styles.chipText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, filter === "desk" && styles.chipOn]} onPress={() => setFilter("desk")}>
            <Text style={styles.chipText}>House desk</Text>
          </TouchableOpacity>
          {services.map((s) => (
            <TouchableOpacity key={s.slug} style={[styles.chip, filter === s.slug && styles.chipOn]} onPress={() => setFilter(s.slug)}>
              <Text style={styles.chipText}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {shown.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.title}>{p.name}{p.fallback ? " · desk" : ""}</Text>
            <Text style={styles.meta}>{p.email}</Text>
            <Text style={styles.meta}>{p.serviceSlugs.join(", ")} · {p.ratingAvg}★ ({p.ratingCount})</Text>
            <Text style={styles.meta}>{p.packActive ? `Pack active until ${String(p.packPaidUntil || "").slice(0, 10)}` : "Pack not paid — will not get jobs"} · ₹{p.packAmount}</Text>
            <TextInput
              style={styles.input}
              value={phoneEdit[p.id] ?? p.phone}
              onChangeText={(phone) => setPhoneEdit((s) => ({ ...s, [p.id]: phone }))}
            />
            <View style={styles.row}>
              <TouchableOpacity style={styles.ghost} onPress={() => api.ownerUpdateProvider(p.id, { phone: phoneEdit[p.id] ?? p.phone }).then(load).catch((e) => Alert.alert("Phone", e.message))}>
                <Text style={styles.ghostText}>Save phone</Text>
              </TouchableOpacity>
              {!p.fallback ? (
                <TouchableOpacity style={styles.primary} onPress={() => api.ownerPayProviderPack(p.id, { amount: p.packAmount }).then(load).catch((e) => Alert.alert("Pack", e.message))}>
                  <Text style={styles.primaryText}>Mark pack paid</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.ghost} onPress={() => api.ownerRemoveProvider(p.id).then(load).catch((e) => Alert.alert("Remove", e.message))}>
                <Text style={styles.ghostText}>{p.active ? "Remove" : "Removed"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  note: { color: "#5C6B73", ...body(400), fontSize: 13, lineHeight: 18 },
  h: { ...head(700), color: "#1B2B33", marginTop: 18, marginBottom: 8 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, backgroundColor: "#fff" },
  chipOn: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  chipText: { ...body(600), color: "#1B2B33", fontSize: 12 },
  chipTextOn: { color: "#fff" },
  check: { marginVertical: 8 },
  checkText: { ...body(600), color: "#1B2B33" },
  primary: { backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignSelf: "flex-start" },
  primaryText: { color: "#fff", ...body(700) },
  ghost: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fff" },
  ghostText: { ...body(700), color: "#1B2B33" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { ...head(700), fontSize: 16, color: "#1B2B33" },
  meta: { ...body(400), color: "#5C6B73", marginTop: 3 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
});
