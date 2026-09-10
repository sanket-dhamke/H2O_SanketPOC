import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "../components/ScreenHeader";
import OffersRail from "../components/OffersRail";
import TextInput from "../components/AppTextInput";
import ServiceThumb from "../components/ServiceThumb";
import { useAuth } from "../lib/auth";
import {
  FEATURED_SLUGS,
  HOME_SERVICES,
  inr,
  loadHomeServices,
  loadServiceBookings,
  updateServiceBooking,
  BOOKING_STATUS,
} from "../lib/homeServices";
import { body, head } from "../lib/type";

function prettyDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function HomeServicesScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState(route.params?.tab === "orders" ? "orders" : "services");
  const [query, setQuery] = useState("");
  const [services, setServices] = useState(HOME_SERVICES);
  const [bookings, setBookings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gridW, setGridW] = useState(0);

  const load = useCallback(async () => {
    try {
      const [cat, book] = await Promise.all([
        loadHomeServices(),
        loadServiceBookings(user).catch(() => ({ bookings: [] })),
      ]);
      setServices(cat.services || HOME_SERVICES);
      setBookings(book.bookings || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (route.params?.tab === "orders") setTab("orders");
      load();
    }, [load, route.params?.tab])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? services.filter((s) => `${s.name} ${s.tagline}`.toLowerCase().includes(q)) : services),
    [services, q]
  );
  const featured = filtered.filter((s) => FEATURED_SLUGS.includes(s.slug));
  const more = filtered.filter((s) => !FEATURED_SLUGS.includes(s.slug));
  const gridGap = 12;
  const cols = gridW >= 1100 ? 4 : gridW >= 760 ? 3 : 2;
  const tileW = gridW > 0 ? Math.floor((gridW - gridGap * (cols - 1)) / cols) : "48%";

  const open = (slug) => navigation.navigate("HomeServiceDetail", { slug });

  const changeStatus = async (booking, status) => {
    try {
      await updateServiceBooking(user, booking.id, status);
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="construct"
        title="Home Services"
        subtitle="Book trusted partners into your flat"
        onBack={() => navigation.goBack()}
      />
      <View style={styles.segment}>
        <Seg label="Services" active={tab === "services"} onPress={() => setTab("services")} />
        <Seg
          label={`${isAdmin ? "Orders" : "My bookings"}${bookings.length ? ` (${bookings.length})` : ""}`}
          active={tab === "orders"}
          onPress={() => setTab("orders")}
        />
      </View>

      {tab === "services" ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0B6E8F" />}
        >
          <View style={styles.search}>
            <Ionicons name="search" size={18} color="#8895A0" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search cleaning, AC, painting…"
            />
          </View>

          {loading ? <ActivityIndicator color="#0B6E8F" style={{ marginVertical: 20 }} /> : null}

          <View
            style={styles.grid}
            onLayout={(e) => {
              const w = Math.round(e.nativeEvent.layout.width);
              if (w && w !== gridW) setGridW(w);
            }}
          >
            {featured.map((s) => (
              <ServiceTile key={s.slug} service={s} width={tileW} onPress={() => open(s.slug)} />
            ))}
          </View>

          {more.length ? (
            <>
              <Text style={styles.moreTitle}>Also in this society</Text>
              <View
                style={styles.grid}
                onLayout={(e) => {
                  const w = Math.round(e.nativeEvent.layout.width);
                  if (w && w !== gridW) setGridW(w);
                }}
              >
                {more.map((s) => (
                  <ServiceTile key={s.slug} service={s} width={tileW} onPress={() => open(s.slug)} />
                ))}
              </View>
            </>
          ) : null}

          <OffersRail slot="home_services" navigation={navigation} showSpotlight />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0B6E8F" />}
        >
          {bookings.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={32} color="#B7C2C9" />
              <Text style={styles.emptyText}>No bookings yet. Pick a service to schedule a visit.</Text>
            </View>
          ) : (
            bookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                isAdmin={isAdmin}
                onStatus={(status) => changeStatus(b, status)}
                onOpen={() => open(b.serviceSlug)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Seg({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.seg, active && styles.segOn]} onPress={onPress}>
      <Text style={[styles.segText, active && styles.segTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ServiceTile({ service, onPress, width }) {
  return (
    <TouchableOpacity style={[styles.tile, width ? { width } : null]} onPress={onPress} activeOpacity={0.88}>
      <ServiceThumb uri={service.image} icon={service.icon} color="#0B6E8F" style={styles.tileImg} />
      {service.badge ? (
        <View style={styles.tileBadge}>
          <Text style={styles.tileBadgeText}>{service.badge}</Text>
        </View>
      ) : null}
      <View style={styles.tileBody}>
        <Text style={styles.tileName} numberOfLines={2}>
          {service.name}
        </Text>
        <Text style={styles.tilePrice}>
          {service.priceFrom === 0 ? "Free ideas" : `From ${inr(service.priceFrom)}`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function BookingCard({ booking, isAdmin, onStatus, onOpen }) {
  const meta = BOOKING_STATUS[booking.status] || BOOKING_STATUS.requested;
  const open = ["requested", "confirmed", "assigned"].includes(booking.status);
  return (
    <View style={styles.bookCard}>
      <TouchableOpacity onPress={onOpen} activeOpacity={0.85}>
        <View style={styles.bookTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bookName}>{booking.serviceName}</Text>
            <Text style={styles.bookPkg}>{booking.packageName}</Text>
            <Text style={styles.bookMeta}>
              {prettyDate(booking.scheduledDate)} · {booking.slot}
              {isAdmin && booking.flatNo ? ` · ${booking.flatNo}` : ""}
            </Text>
            {isAdmin && booking.residentName ? (
              <Text style={styles.bookMeta}>{booking.residentName}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.bookAmt}>{inr(booking.amount)}</Text>
            <View style={[styles.status, { backgroundColor: meta.bg }]}>
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
      {open && !isAdmin ? (
        <TouchableOpacity style={styles.cancelBtn} onPress={() => onStatus("cancelled")}>
          <Text style={styles.cancelText}>Cancel booking</Text>
        </TouchableOpacity>
      ) : null}
      {isAdmin && booking.status === "requested" ? (
        <View style={styles.adminRow}>
          <TouchableOpacity style={styles.confirmBtn} onPress={() => onStatus("confirmed")}>
            <Text style={styles.confirmText}>Confirm</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => onStatus("cancelled")}>
            <Text style={styles.cancelText}>Decline</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {isAdmin && (booking.status === "confirmed" || booking.status === "assigned") ? (
        <View style={styles.adminRow}>
          <TouchableOpacity style={styles.confirmBtn} onPress={() => onStatus("completed")}>
            <Text style={styles.confirmText}>Mark completed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => onStatus("cancelled")}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  segment: { flexDirection: "row", backgroundColor: "#fff", margin: 16, marginBottom: 0, borderRadius: 12, padding: 4 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segOn: { backgroundColor: "#0B6E8F" },
  segText: { color: "#6B7B85", ...body(700), fontSize: 13 },
  segTextOn: { color: "#fff" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E6EEF2",
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, width: "100%" },
  tile: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E6EEF2",
  },
  tileImg: { width: "100%", height: 110 },
  tileBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#0B6E8F",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tileBadgeText: { color: "#fff", fontSize: 10, ...head(700) },
  tileBody: { padding: 10 },
  tileName: { fontSize: 13, ...head(700), color: "#1B2B33" },
  tilePrice: { fontSize: 12, color: "#0B6E8F", marginTop: 4, ...body(600) },
  moreTitle: { fontSize: 16, ...head(800), color: "#1B2B33", marginTop: 18, marginBottom: 10 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { color: "#6B7B85", textAlign: "center", ...body(400), paddingHorizontal: 24 },
  bookCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 },
  bookTop: { flexDirection: "row", gap: 10 },
  bookName: { fontSize: 15, ...head(800), color: "#1B2B33" },
  bookPkg: { fontSize: 13, color: "#48606B", marginTop: 2, ...body(500) },
  bookMeta: { fontSize: 12, color: "#8895A0", marginTop: 4, ...body(400) },
  bookAmt: { fontSize: 16, ...head(800), color: "#1B2B33", textAlign: "right" },
  status: { alignSelf: "flex-end", marginTop: 6, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, ...body(700) },
  cancelBtn: { marginTop: 10, borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingVertical: 10, alignItems: "center", flex: 1 },
  cancelText: { color: "#6B7B85", ...body(700) },
  adminRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  confirmBtn: { flex: 1, marginTop: 10, backgroundColor: "#1E7A3D", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  confirmText: { color: "#fff", ...body(700) },
});
