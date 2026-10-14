import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import ScreenHeader from "../../components/ScreenHeader";
import TextInput from "../../components/AppTextInput";
import { api } from "../../lib/api";
import { brand } from "../../lib/brand";
import { body, head } from "../../lib/type";

const empty = { name: "", email: "", phone: "", password: "Password123", packAmount: "4999", serviceSlugs: [], fallback: false };

export default function ProvidersScreen() {
  const [rows, setRows] = useState([]);
  const [services, setServices] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState("all");
  const [phoneEdit, setPhoneEdit] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await api.ownerProviders();
    setRows(res.providers || []);
    setServices(res.services || []);
    setRevenue(res.revenue || 0);
    setJoinCode(res.providerJoinCode || "");
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

  const shareCode = async () => {
    if (!joinCode) return;
    try {
      await Share.share({
        message:
          `Register as a service professional on ${brand.name}.\n\n` +
          `1. Install ${brand.name}\n2. Tap Register\n3. Choose Service professional\n` +
          `4. Enter provider code: ${joinCode}\n5. Pick the services you do and set a password.\n\n` +
          `The ${brand.name} owner approves your account. This code is not a society resident join code.`,
      });
    } catch {}
  };

  const rotateCode = () => {
    Alert.alert("Generate a new provider code?", "The current code stops working immediately.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Generate new",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await api.ownerRotateProviderCode();
            setJoinCode(res.providerJoinCode || "");
          } catch (e) {
            Alert.alert("Code", e.message);
          }
        },
      },
    ]);
  };

  const approve = (p) => {
    api.ownerApproveProvider(p.id).then(load).catch((e) => Alert.alert("Approve", e.message));
  };

  const reject = (p) => {
    Alert.alert("Decline registration", `Remove ${p.name}'s request?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: () => api.ownerRejectProvider(p.id).then(load).catch((e) => Alert.alert("Decline", e.message)),
      },
    ]);
  };

  const pending = rows.filter((p) => p.pendingApproval);
  const shown = rows.filter((p) => !p.pendingApproval && (filter === "all" || p.serviceSlugs.includes(filter) || (filter === "desk" && p.fallback)));

  return (
    <View style={styles.container}>
      <ScreenHeader icon="people" title="Service professionals" subtitle={`Annual pack collected ₹${Number(revenue).toLocaleString("en-IN")}`} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={styles.note}>
          Share the provider code so a professional can register themselves, or add the login here. Either way you approve them, then mark the annual pack paid (default ₹4,999) before they receive jobs. The house desk is exempt and accepts a job only after every other free professional ignores the 60-second offer.
        </Text>

        <View style={styles.codeCard}>
          <View style={styles.codeTop}>
            <Ionicons name="qr-code-outline" size={18} color="#0B6E8F" />
            <Text style={styles.codeTitle}>Provider registration code</Text>
          </View>
          <Text style={styles.meta}>Professionals enter this on Register → Service professional. It is not the society resident code.</Text>
          <Text style={styles.code}>{joinCode || "…"}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.primary} onPress={shareCode} disabled={!joinCode}>
              <Text style={styles.primaryText}>Share code</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghost} onPress={rotateCode} disabled={!joinCode}>
              <Text style={styles.ghostText}>New code</Text>
            </TouchableOpacity>
          </View>
        </View>

        {pending.length ? (
          <>
            <Text style={styles.h}>Waiting for approval ({pending.length})</Text>
            {pending.map((p) => (
              <View key={p.id} style={styles.card}>
                <Text style={styles.title}>{p.name}</Text>
                <Text style={styles.meta}>{p.email} · {p.phone}</Text>
                <Text style={styles.meta}>{p.serviceSlugs.join(", ")}</Text>
                <View style={styles.row}>
                  <TouchableOpacity style={styles.primary} onPress={() => approve(p)}>
                    <Text style={styles.primaryText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ghost} onPress={() => reject(p)}>
                    <Text style={styles.ghostText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : null}

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
  codeCard: { backgroundColor: "#EAF4F7", borderRadius: 12, padding: 14, marginTop: 14 },
  codeTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  codeTitle: { ...head(700), color: "#0B6E8F", fontSize: 15 },
  code: { fontSize: 24, fontWeight: "800", color: "#0B6E8F", letterSpacing: 3, textAlign: "center", marginVertical: 10 },
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
