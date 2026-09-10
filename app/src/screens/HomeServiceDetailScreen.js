import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "../components/ScreenHeader";
import DateField from "../components/DateField";
import TextInput from "../components/AppTextInput";
import { useAuth } from "../lib/auth";
import {
  findHomeService,
  HOME_SERVICE_SLOTS,
  inr,
  createServiceBooking,
} from "../lib/homeServices";
import { body, head } from "../lib/type";
import { imageForService } from "../lib/serviceImages";

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function packageSections(service) {
  const packs = service?.packages || [];
  const hasGroups = packs.some((p) => p.group);
  if (!hasGroups) return [{ title: "Choose a package", packs }];
  const order = [];
  const map = new Map();
  for (const p of packs) {
    const g = p.group || "Other";
    if (!map.has(g)) {
      map.set(g, []);
      order.push(g);
    }
    map.get(g).push(p);
  }
  return order.map((title) => ({ title, packs: map.get(title) }));
}

export default function HomeServiceDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const service = findHomeService(route.params?.slug);
  const [packId, setPackId] = useState(service?.packages?.[0]?.id || "");
  const [date, setDate] = useState(route.params?.date || todayISO());
  const [slot, setSlot] = useState(route.params?.slot || HOME_SERVICE_SLOTS[0]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const pack = useMemo(
    () => service?.packages?.find((p) => p.id === packId) || service?.packages?.[0],
    [service, packId]
  );

  if (!service) {
    return (
      <View style={styles.container}>
        <ScreenHeader icon="construct" title="Home Services" subtitle="Not found" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("CommunityHome"))} />
        <Text style={styles.missing}>This service is not in the catalogue.</Text>
      </View>
    );
  }

  const book = async () => {
    if (!pack) {
      Alert.alert("Pick a package", "Choose what you need before booking.");
      return;
    }
    if (!date || !slot) {
      Alert.alert("Pick a slot", "Choose a date and time window.");
      return;
    }
    setBusy(true);
    try {
      const { booking, offline } = await createServiceBooking(user, {
        serviceSlug: service.slug,
        packageId: pack.id,
        scheduledDate: date,
        slot,
        notes,
      });
      const when = `${date} · ${slot}`;
      const line =
        booking.status === "confirmed"
          ? `${pack.name} is confirmed for ${when}. ${service.partnerName || "A partner"} is on the way once the slot opens.`
          : `${pack.name} requested for ${when}. Your society desk will confirm shortly.`;
      Alert.alert(offline ? "Booked on this device" : "Booking placed", line, [
        {
          text: "View bookings",
          onPress: () => navigation.navigate("HomeServices", { tab: "orders" }),
        },
      ]);
    } catch (e) {
      Alert.alert("Could not book", e.message);
    } finally {
      setBusy(false);
    }
  };

  const related = service.related;
  const heroSrc = imageForService(service);

  return (
    <View style={styles.container}>
      <ScreenHeader icon={service.icon || "construct"} title={service.name} subtitle={service.tagline} onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("CommunityHome"))} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ServiceHero source={heroSrc} color={service.color} icon={service.icon}>
          {service.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{service.badge}</Text>
            </View>
          ) : null}
          <Text style={styles.heroMeta}>
            ★ {service.rating} · {service.jobs} jobs · {service.partnerName}
          </Text>
        </ServiceHero>

        <View style={styles.body}>
          {packageSections(service).map((section) => (
            <View key={section.title}>
              <Text style={styles.section}>{section.title}</Text>
              {section.packs.map((p) => {
                const on = p.id === pack?.id;
                return (
                  <TouchableOpacity key={p.id} style={[styles.pack, on && styles.packOn]} onPress={() => setPackId(p.id)} activeOpacity={0.85}>
                    <View style={[styles.radio, on && styles.radioOn]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.packName}>{p.name}</Text>
                      <Text style={styles.packDetail}>
                        {p.duration} · {p.detail}
                      </Text>
                    </View>
                    <Text style={styles.packPrice}>{p.price === 0 ? "Free" : inr(p.price)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <Text style={styles.section}>When should they come?</Text>
          <DateField value={date} onChange={setDate} placeholder="Select date" minToday />
          <View style={styles.slots}>
            {HOME_SERVICE_SLOTS.map((s) => (
              <TouchableOpacity key={s} style={[styles.slot, s === slot && styles.slotOn]} onPress={() => setSlot(s)}>
                <Text style={[styles.slotText, s === slot && styles.slotTextOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>Notes for the partner</Text>
          <TextInput
            style={styles.notes}
            value={notes}
            onChangeText={setNotes}
            placeholder={`Flat ${user?.flatNo || ""} · any access or issue details`}
            multiline
          />

          {related ? (
            <TouchableOpacity
              style={styles.related}
              onPress={() => navigation.navigate(related.route, related.params)}
            >
              <Ionicons name="document-text-outline" size={18} color="#0B6E8F" />
              <Text style={styles.relatedText}>{related.label}</Text>
              <Ionicons name="chevron-forward" size={16} color="#0B6E8F" />
            </TouchableOpacity>
          ) : null}

          <View style={styles.payBox}>
            <View>
              <Text style={styles.payLabel}>Payable at visit</Text>
              <Text style={styles.payAmt}>{pack?.price === 0 ? "Free" : inr(pack?.price)}</Text>
            </View>
            <TouchableOpacity style={[styles.bookBtn, busy && { opacity: 0.6 }]} onPress={book} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.bookText}>Book visit</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.fine}>
            {service.etaMinutes <= 15
              ? "Instant jobs are auto-confirmed. Pay the partner after the visit."
              : "Society-verified partner. Pay after the work is done — no charge if you cancel before they start."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ServiceHero({ source, color, icon, children }) {
  const [failed, setFailed] = useState(!source);
  return (
    <View style={[styles.hero, failed && { backgroundColor: color || "#0B6E8F" }]}>
      {!failed && source ? (
        <Image source={source} style={styles.heroImg} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <Ionicons name={icon || "construct"} size={56} color="rgba(255,255,255,0.35)" style={styles.heroFallbackIcon} />
      )}
      <View style={styles.heroShade} />
      <View style={styles.heroBits}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  missing: { textAlign: "center", color: "#6B7B85", marginTop: 40 },
  hero: { height: 280, justifyContent: "flex-end", backgroundColor: "#D7DEE3", overflow: "hidden" },
  heroImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" },
  heroFallbackIcon: { position: "absolute", right: 18, top: 18 },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,20,30,0.28)" },
  heroBits: { padding: 16 },
  badge: { alignSelf: "flex-start", backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  badgeText: { color: "#fff", fontSize: 11, ...head(700) },
  heroMeta: { color: "#fff", fontSize: 13, ...body(600) },
  body: { padding: 16 },
  section: { fontSize: 15, ...head(800), color: "#1B2B33", marginTop: 8, marginBottom: 10 },
  pack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E6EEF2",
  },
  packOn: { borderColor: "#0B6E8F", backgroundColor: "#EAF4F7" },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#C7D2D8" },
  radioOn: { borderColor: "#0B6E8F", backgroundColor: "#0B6E8F" },
  packName: { fontSize: 14, ...head(700), color: "#1B2B33" },
  packDetail: { fontSize: 12, color: "#6B7B85", marginTop: 2, ...body(400) },
  packPrice: { fontSize: 14, ...head(800), color: "#0B6E8F" },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginBottom: 8 },
  slot: { borderWidth: 1, borderColor: "#D6DEE3", backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  slotOn: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  slotText: { fontSize: 12, color: "#334", ...body(600) },
  slotTextOn: { color: "#fff" },
  notes: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: 15,
  },
  related: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    backgroundColor: "#EAF4F7",
    borderRadius: 12,
    padding: 12,
  },
  relatedText: { flex: 1, color: "#0B6E8F", ...body(700), fontSize: 13 },
  payBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
    gap: 12,
  },
  payLabel: { fontSize: 12, color: "#6B7B85", ...body(500) },
  payAmt: { fontSize: 22, ...head(800), color: "#1B2B33" },
  bookBtn: { backgroundColor: "#0B6E8F", borderRadius: 12, paddingHorizontal: 22, paddingVertical: 14, minWidth: 130, alignItems: "center" },
  bookText: { color: "#fff", ...head(700), fontSize: 15 },
  fine: { fontSize: 12, color: "#8895A0", marginTop: 10, lineHeight: 17, ...body(400) },
});
