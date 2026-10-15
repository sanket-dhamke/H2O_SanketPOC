import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
const DAY = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

function rupees(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function day(value) {
  return String(value || "").slice(0, 10);
}

function packFacts(p) {
  if (p.fallback) {
    return {
      ok: true,
      text: "House desk. No annual pack. This login takes a visit only after every other professional passes the 60-second offer.",
    };
  }
  const until = day(p.packPaidUntil);
  if (p.lastPayment && p.packActive) {
    return {
      ok: true,
      text: `Paid ${rupees(p.lastPayment.amount)} on ${p.lastPayment.paidOn}. Valid until ${until}. They can receive jobs.`,
    };
  }
  if (p.packActive && until) {
    return { ok: true, text: `Paid. Valid until ${until}. They can receive jobs.` };
  }
  return {
    ok: false,
    text: `Not paid. The login exists, but they will not get jobs until you record ${rupees(p.packAmount)}.`,
  };
}

export default function ProvidersScreen() {
  const [rows, setRows] = useState([]);
  const [services, setServices] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState("all");
  const [phoneEdit, setPhoneEdit] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [probe, setProbe] = useState("");
  const [probeResult, setProbeResult] = useState(null);
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const say = (text, ok = false) => {
    setNotice(text);
    setNoticeOk(ok);
  };

  const load = useCallback(async () => {
    const res = await api.ownerProviders();
    setRows(res.providers || []);
    setServices(res.services || []);
    setRevenue(res.revenue || 0);
    setJoinCode(res.providerJoinCode || "");
  }, []);

  useFocusEffect(useCallback(() => { load().catch((e) => say(e.message)); }, [load]));

  const toggleSlug = (slug) => {
    setForm((f) => ({
      ...f,
      serviceSlugs: f.serviceSlugs.includes(slug) ? f.serviceSlugs.filter((s) => s !== slug) : [...f.serviceSlugs, slug],
    }));
  };

  const create = async () => {
    const name = form.name.trim() || "This professional";
    const amount = form.packAmount;
    const desk = form.fallback;
    try {
      await api.ownerCreateProvider({ ...form, packAmount: Number(form.packAmount) });
      setForm(empty);
      say(
        desk
          ? `${name} can log in. The house desk does not pay a pack.`
          : `${name} can log in. They will not receive jobs until you record ${rupees(amount)} on their card below.`,
        true
      );
      await load();
    } catch (e) {
      say(e.message);
    }
  };

  const checkCode = async () => {
    try {
      const res = await api.ownerCheckProviderCode(probe);
      setProbeResult(res);
    } catch (e) {
      setProbeResult({ ok: false, message: e.message });
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

  const rotateCode = async () => {
    if (confirm !== "rotate") {
      setConfirm("rotate");
      say("Tap New code again. The current code stops working immediately.");
      return;
    }
    try {
      const res = await api.ownerRotateProviderCode();
      setJoinCode(res.providerJoinCode || "");
      setConfirm(null);
      say(`New provider code is ${res.providerJoinCode}. Share this one. The previous code no longer works.`, true);
    } catch (e) {
      say(e.message);
    }
  };

  const approve = (p) => {
    api.ownerApproveProvider(p.id).then(() => {
      say(`${p.name} is approved. Record the annual pack on their card before they can receive jobs.`, true);
      return load();
    }).catch((e) => say(e.message));
  };

  const reject = (p) => {
    if (confirm !== `reject:${p.id}`) {
      setConfirm(`reject:${p.id}`);
      say(`Tap Decline again to remove ${p.name}'s request.`);
      return;
    }
    api.ownerRejectProvider(p.id).then(() => {
      setConfirm(null);
      say(`${p.name}'s request was declined.`, true);
      return load();
    }).catch((e) => say(e.message));
  };

  const recordPack = async (p) => {
    try {
      const res = await api.ownerPayProviderPack(p.id, { amount: p.packAmount });
      const until = day(res.provider?.packPaidUntil);
      say(`Recorded. ${p.name} paid ${rupees(p.packAmount)} today. Jobs stay open until ${until}.`, true);
      await load();
    } catch (e) {
      say(e.message);
    }
  };

  const remove = (p) => {
    if (!p.active) return;
    if (confirm !== `remove:${p.id}`) {
      setConfirm(`remove:${p.id}`);
      say(`Tap Remove again to turn off ${p.name}'s login.`);
      return;
    }
    api.ownerRemoveProvider(p.id).then(() => {
      setConfirm(null);
      say(`${p.name} can no longer log in.`, true);
      return load();
    }).catch((e) => say(e.message));
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
          Share the provider code so a professional can register themselves, or add the login here. A login can exist before payment. They receive jobs only after you record the annual pack (default ₹4,999) on their card. The house desk is exempt.
        </Text>
        {!!notice && <Text style={[styles.notice, noticeOk && styles.noticeOk]}>{notice}</Text>}

        <View style={styles.codeCard}>
          <View style={styles.codeTop}>
            <Ionicons name="qr-code-outline" size={18} color="#0B6E8F" />
            <Text style={styles.codeTitle}>Provider registration code</Text>
          </View>
          <Text style={styles.meta}>Professionals enter this on Register → Service professional. It is not the society resident code.</Text>
          <Text style={styles.code}>{joinCode || "…"}</Text>
          <Text style={styles.meta}>Type a code below to see if it still matches this one.</Text>
          <TextInput
            style={styles.input}
            placeholder="Type a code to test"
            autoCapitalize="characters"
            value={probe}
            onChangeText={(value) => {
              setProbe(value);
              setProbeResult(null);
            }}
          />
          <TouchableOpacity style={styles.ghost} onPress={checkCode}>
            <Text style={styles.ghostText}>Check this code</Text>
          </TouchableOpacity>
          {probeResult ? (
            <Text style={[styles.probe, probeResult.ok ? styles.probeOk : styles.probeBad]}>{probeResult.message}</Text>
          ) : null}
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
            <Text style={styles.meta}>
              Works {p.workStart}–{p.workEnd}
              {p.offDays?.length ? `, off ${p.offDays.map((d) => DAY[d] || d).join(", ")}` : ""}
            </Text>
            <Text style={[styles.pack, packFacts(p).ok ? styles.packOk : styles.packWait]}>{packFacts(p).text}</Text>
            <TextInput
              style={styles.input}
              value={phoneEdit[p.id] ?? p.phone}
              onChangeText={(phone) => setPhoneEdit((s) => ({ ...s, [p.id]: phone }))}
            />
            <View style={styles.row}>
              <TouchableOpacity style={styles.ghost} onPress={() => api.ownerUpdateProvider(p.id, { phone: phoneEdit[p.id] ?? p.phone }).then(() => { say("Phone saved.", true); return load(); }).catch((e) => say(e.message))}>
                <Text style={styles.ghostText}>Save phone</Text>
              </TouchableOpacity>
              {!p.fallback ? (
                <TouchableOpacity style={styles.primary} onPress={() => recordPack(p)}>
                  <Text style={styles.primaryText}>
                    {p.packActive ? `Record another year (${rupees(p.packAmount)})` : `Record ${rupees(p.packAmount)} received`}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.ghost} onPress={() => remove(p)}>
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
  notice: { backgroundColor: "#FDECEC", color: "#8A1F18", borderRadius: 10, padding: 12, marginTop: 10, ...body(700), lineHeight: 20 },
  noticeOk: { backgroundColor: "#E7F6EC", color: "#1E7A3D" },
  probe: { marginTop: 8, ...body(700), lineHeight: 20 },
  probeOk: { color: "#1E7A3D" },
  probeBad: { color: "#8A1F18" },
  pack: { marginTop: 8, borderRadius: 8, padding: 10, ...body(700), lineHeight: 20 },
  packOk: { backgroundColor: "#E7F6EC", color: "#1E7A3D" },
  packWait: { backgroundColor: "#FFF4E8", color: "#8A4B12" },
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
