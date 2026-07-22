import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { labelsFor } from "../lib/org";
import ScreenHeader from "../components/ScreenHeader";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const prettyDate = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

const STATUS_META = {
  requested: { label: "Pending approval", color: "#C2571A", bg: "#FBEADD", icon: "hourglass-outline" },
  approved: { label: "Approved · pay to confirm", color: "#0B6E8F", bg: "#EAF4F7", icon: "checkmark-circle-outline" },
  paid: { label: "Booked & paid", color: "#2E9E52", bg: "#E6F5EC", icon: "ribbon-outline" },
  rejected: { label: "Declined", color: "#B44", bg: "#FBEAEA", icon: "close-circle-outline" },
  cancelled: { label: "Cancelled", color: "#8794A0", bg: "#EEF2F4", icon: "ban-outline" },
};

export default function AmenitiesScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const isAdmin = user?.role === "admin";
  const L = labelsFor(user);

  const onBack = navigation?.canGoBack?.() ? () => navigation.goBack() : undefined;

  return isAdmin ? (
    <AdminAmenities onBack={onBack} L={L} />
  ) : (
    <ResidentAmenities onBack={onBack} L={L} />
  );
}

/* ============================ Resident view ============================== */
function ResidentAmenities({ onBack, L }) {
  const [tab, setTab] = useState("book");
  const [amenities, setAmenities] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api.amenities(), api.bookings()]);
      setAmenities(a.amenities || []);
      setBookings(b.bookings || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const pending = bookings.filter((b) => b.status === "requested" || b.status === "approved");

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="calendar"
        title={L.amenities}
        subtitle={L.amenitiesSubResident}
        onBack={onBack}
      />
      <View style={styles.segment}>
        <Seg label="Book" active={tab === "book"} onPress={() => setTab("book")} />
        <Seg
          label={`My bookings${bookings.length ? ` (${bookings.length})` : ""}`}
          active={tab === "mine"}
          onPress={() => setTab("mine")}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#0B6E8F" />
        ) : tab === "book" ? (
          amenities.length === 0 ? (
            <Empty text={L.amenityEmptyResident} />
          ) : (
            amenities.map((a) => <BookCard key={a.id} amenity={a} onBooked={() => { load(); setTab("mine"); }} />)
          )
        ) : bookings.length === 0 ? (
          <Empty text="You have no bookings yet. Switch to Book to reserve a slot." />
        ) : (
          bookings.map((b) => (
            <BookingRow key={b.id} booking={b} onChanged={load} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// One amenity with slot picker + date picker + request.
function BookCard({ amenity, onBooked }) {
  const [slotId, setSlotId] = useState(amenity.slots?.[0]?.id || null);
  const [date, setDate] = useState(null);
  const [notes, setNotes] = useState("");
  const [taken, setTaken] = useState([]); // [{slotId, date}]
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => {
    const arr = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      arr.push(ymd(d));
    }
    return arr;
  }, []);

  const loadAvailability = useCallback(async () => {
    try {
      const r = await api.amenityAvailability(amenity.id);
      setTaken(r.taken || []);
    } catch { /* ignore */ }
  }, [amenity.id]);

  useFocusEffect(useCallback(() => { loadAvailability(); }, [loadAvailability]));

  const isTaken = (sId, d) => taken.some((t) => t.slotId === sId && t.date === d);
  const slot = amenity.slots.find((s) => s.id === slotId);

  const submit = async () => {
    if (!slotId || !date) {
      Alert.alert("Pick a slot & date", "Select a time slot and a date first.");
      return;
    }
    setBusy(true);
    try {
      await api.createBooking({ amenityId: amenity.id, slotId, date, notes: notes.trim() || undefined });
      Alert.alert("Request sent", "Your booking request was sent to the admin for approval.");
      setDate(null);
      setNotes("");
      onBooked();
    } catch (e) {
      Alert.alert("Could not book", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.amHead}>
        <View style={styles.amIcon}>
          <Ionicons name="business" size={20} color="#0B6E8F" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{amenity.name}</Text>
          {!!amenity.description && <Text style={styles.amDesc}>{amenity.description}</Text>}
        </View>
      </View>

      <Text style={styles.sectionLabel}>Choose a slot</Text>
      <View style={styles.slotWrap}>
        {amenity.slots.map((s) => {
          const active = s.id === slotId;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.slot, active && styles.slotActive]}
              onPress={() => { setSlotId(s.id); setDate(null); }}
            >
              <Text style={[styles.slotLabel, active && { color: "#fff" }]}>{s.label}</Text>
              {(s.startTime || s.endTime) && (
                <Text style={[styles.slotTime, active && { color: "#DCEFF5" }]}>
                  {[s.startTime, s.endTime].filter(Boolean).join(" – ")}
                </Text>
              )}
              <Text style={[styles.slotPrice, active && { color: "#fff" }]}>{money(s.price)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Pick a date</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {days.map((d) => {
          const disabled = slotId && isTaken(slotId, d);
          const active = d === date;
          return (
            <TouchableOpacity
              key={d}
              disabled={disabled}
              style={[styles.day, active && styles.dayActive, disabled && styles.dayDisabled]}
              onPress={() => setDate(d)}
            >
              <Text style={[styles.dayText, active && { color: "#fff" }, disabled && { color: "#B7C1C8" }]}>
                {prettyDate(d)}
              </Text>
              {disabled && <Text style={styles.dayTaken}>booked</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Add a note for the admin (optional)"
      />

      <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        <Ionicons name="calendar-outline" size={16} color="#fff" />
        <Text style={styles.primaryBtnText}>
          {busy ? "Sending…" : `Request booking${slot ? ` · ${money(slot.price)}` : ""}`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// A resident's own booking with pay/cancel actions.
function BookingRow({ booking, onChanged }) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[booking.status] || STATUS_META.requested;

  const pay = async () => {
    setBusy(true);
    try {
      await api.payBooking(booking.id);
      Alert.alert("Payment successful", `Your ${booking.amenityName} slot is confirmed.`);
      onChanged();
    } catch (e) {
      Alert.alert("Payment failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () =>
    Alert.alert("Cancel booking", "Cancel this booking request?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: async () => {
          try {
            await api.cancelBooking(booking.id);
            onChanged();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);

  return (
    <View style={styles.card}>
      <View style={styles.bkHead}>
        <Text style={styles.title}>{booking.amenityName}</Text>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={12} color={meta.color} />
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      <Text style={styles.bkLine}>
        {booking.slotLabel} · {prettyDate(booking.date)} · {money(booking.amount)}
      </Text>
      {!!booking.notes && <Text style={styles.bkNote}>“{booking.notes}”</Text>}
      {!!booking.paymentRef && <Text style={styles.bkRef}>Ref: {booking.paymentRef}</Text>}

      {(booking.status === "approved" || booking.status === "requested") && (
        <View style={styles.bkActions}>
          {booking.status === "approved" && (
            <TouchableOpacity style={[styles.payBtn, busy && { opacity: 0.6 }]} onPress={pay} disabled={busy}>
              <Ionicons name="card-outline" size={16} color="#fff" />
              <Text style={styles.payBtnText}>{busy ? "Paying…" : `Pay ${money(booking.amount)}`}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.ghostBtn} onPress={cancel}>
            <Text style={styles.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ============================== Admin view =============================== */
function AdminAmenities({ onBack, L }) {
  const [tab, setTab] = useState("requests");
  const [amenities, setAmenities] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [amenityModal, setAmenityModal] = useState(false);
  const [slotModal, setSlotModal] = useState(null); // { amenityId, slot? }

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api.adminListAmenities(), api.bookings()]);
      setAmenities(a.amenities || []);
      setBookings(b.bookings || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const requests = bookings.filter((b) => b.status === "requested");
  const others = bookings.filter((b) => b.status !== "requested");

  const decide = async (id, status) => {
    try {
      await api.adminDecideBooking(id, status);
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const toggleAmenity = async (a) => {
    try {
      await api.adminUpdateAmenity(a.id, { enabled: !a.enabled });
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const removeAmenity = (a) =>
    Alert.alert("Delete amenity", `Delete "${a.name}" and all its bookings?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.adminDeleteAmenity(a.id);
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);

  const removeSlot = (slot) =>
    Alert.alert("Delete slot", `Remove the "${slot.label}" slot?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.adminDeleteSlot(slot.id);
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);

  const addBtn =
    tab === "manage" ? (
      <TouchableOpacity onPress={() => setAmenityModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    ) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="calendar"
        title={L.amenities}
        subtitle={L.amenitiesSubAdmin}
        onBack={onBack}
        right={addBtn}
      />
      <View style={styles.segment}>
        <Seg label={`Requests${requests.length ? ` (${requests.length})` : ""}`} active={tab === "requests"} onPress={() => setTab("requests")} />
        <Seg label="Manage" active={tab === "manage"} onPress={() => setTab("manage")} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#0B6E8F" />
        ) : tab === "requests" ? (
          <>
            <Text style={styles.groupLabel}>Pending requests</Text>
            {requests.length === 0 && <Empty text="No pending booking requests." />}
            {requests.map((b) => (
              <View key={b.id} style={styles.card}>
                <View style={styles.bkHead}>
                  <Text style={styles.title}>{b.amenityName}</Text>
                  <Text style={styles.amount}>{money(b.amount)}</Text>
                </View>
                <Text style={styles.bkLine}>
                  {b.slotLabel} · {prettyDate(b.date)}
                </Text>
                <Text style={styles.bkWho}>
                  {b.residentName}
                  {b.flatNo ? ` · ${b.flatNo}` : ""}
                </Text>
                {!!b.notes && <Text style={styles.bkNote}>“{b.notes}”</Text>}
                <View style={styles.bkActions}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => decide(b.id, "approved")}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.payBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => decide(b.id, "rejected")}>
                    <Ionicons name="close" size={16} color="#B44" />
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <Text style={[styles.groupLabel, { marginTop: 18 }]}>Booking history</Text>
            {others.length === 0 && <Empty text="No past bookings yet." />}
            {others.map((b) => {
              const meta = STATUS_META[b.status] || STATUS_META.requested;
              return (
                <View key={b.id} style={styles.card}>
                  <View style={styles.bkHead}>
                    <Text style={styles.title}>{b.amenityName}</Text>
                    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon} size={12} color={meta.color} />
                      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.bkLine}>
                    {b.slotLabel} · {prettyDate(b.date)} · {money(b.amount)}
                  </Text>
                  <Text style={styles.bkWho}>
                    {b.residentName}
                    {b.flatNo ? ` · ${b.flatNo}` : ""}
                  </Text>
                </View>
              );
            })}
          </>
        ) : (
          <>
            {amenities.length === 0 && (
              <Empty text={L.amenityEmptyAdmin} />
            )}
            {amenities.map((a) => (
              <View key={a.id} style={styles.card}>
                <View style={styles.amHead}>
                  <View style={styles.amIcon}>
                    <Ionicons name="business" size={20} color="#0B6E8F" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{a.name}</Text>
                    {!!a.description && <Text style={styles.amDesc}>{a.description}</Text>}
                  </View>
                  <Switch
                    value={a.enabled}
                    onValueChange={() => toggleAmenity(a)}
                    trackColor={{ true: "#0B6E8F", false: "#CBD5DB" }}
                    thumbColor="#fff"
                  />
                </View>
                <Text style={styles.enabledHint}>
                  {a.enabled ? "Open for residents to book" : "Disabled — residents can't see this"}
                </Text>

                {a.slots.map((s) => (
                  <View key={s.id} style={styles.slotRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.slotRowLabel}>
                        {s.label} {!s.active && <Text style={styles.inactiveTag}>(hidden)</Text>}
                      </Text>
                      {(s.startTime || s.endTime) && (
                        <Text style={styles.slotRowTime}>{[s.startTime, s.endTime].filter(Boolean).join(" – ")}</Text>
                      )}
                    </View>
                    <Text style={styles.slotRowPrice}>{money(s.price)}</Text>
                    <TouchableOpacity onPress={() => setSlotModal({ amenityId: a.id, slot: s })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="create-outline" size={20} color="#0B6E8F" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSlot(s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={18} color="#B44" />
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={styles.amFooter}>
                  <TouchableOpacity style={styles.linkBtn} onPress={() => setSlotModal({ amenityId: a.id })}>
                    <Ionicons name="add-circle-outline" size={16} color="#0B6E8F" />
                    <Text style={styles.linkText}>Add slot</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.linkBtn} onPress={() => removeAmenity(a)}>
                    <Ionicons name="trash-outline" size={16} color="#B44" />
                    <Text style={[styles.linkText, { color: "#B44" }]}>Delete amenity</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <AmenityModal visible={amenityModal} onClose={() => setAmenityModal(false)} onDone={load} L={L} />
      <SlotModal data={slotModal} onClose={() => setSlotModal(null)} onDone={load} />
    </View>
  );
}

function AmenityModal({ visible, onClose, onDone, L }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Enter an amenity name.");
      return;
    }
    setBusy(true);
    try {
      await api.adminCreateAmenity({
        name: name.trim(),
        description: description.trim() || undefined,
        defaultPrice: defaultPrice ? Number(defaultPrice) : 0,
        enabled: true,
      });
      setName("");
      setDescription("");
      setDefaultPrice("");
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal visible={visible} onClose={onClose} title={`New ${(L?.amenities || "amenity").toLowerCase()}`} icon="business-outline" busy={busy} onSubmit={submit} submitLabel="Create">
      <Text style={styles.hint}>Creates it with Morning, Afternoon and Evening slots (you can edit prices & add more).</Text>
      <Label>Name</Label>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={L?.amenityExample || "Clubhouse / Party Hall"} />
      <Label>Description (optional)</Label>
      <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="What is this facility, capacity, rules…" multiline />
      <Label>Default price per slot (Rs.)</Label>
      <TextInput style={styles.input} value={defaultPrice} onChangeText={setDefaultPrice} placeholder="2000" keyboardType="numeric" />
    </FormModal>
  );
}

function SlotModal({ data, onClose, onDone }) {
  const editing = !!data?.slot;
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [busy, setBusy] = useState(false);

  // Prime fields when a slot is passed for editing.
  React.useEffect(() => {
    if (data?.slot) {
      setLabel(data.slot.label || "");
      setPrice(data.slot.price != null ? String(data.slot.price) : "");
      setStartTime(data.slot.startTime || "");
      setEndTime(data.slot.endTime || "");
    } else {
      setLabel("");
      setPrice("");
      setStartTime("");
      setEndTime("");
    }
  }, [data]);

  const submit = async () => {
    if (!label.trim()) {
      Alert.alert("Missing label", "Enter a slot name (e.g. Full day).");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        label: label.trim(),
        price: price ? Number(price) : 0,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
      };
      if (editing) await api.adminUpdateSlot(data.slot.id, payload);
      else await api.adminAddSlot(data.amenityId, payload);
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      visible={!!data}
      onClose={onClose}
      title={editing ? "Edit slot" : "Add slot"}
      icon="time-outline"
      busy={busy}
      onSubmit={submit}
      submitLabel={editing ? "Save" : "Add"}
    >
      <Label>Slot name</Label>
      <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Full day" />
      <Label>Price (Rs.)</Label>
      <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="5000" keyboardType="numeric" />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Label>Start (optional)</Label>
          <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="08:00" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>End (optional)</Label>
          <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} placeholder="12:00" />
        </View>
      </View>
    </FormModal>
  );
}

/* ============================== Shared bits ============================== */
function Seg({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.seg, active && styles.segActive]} onPress={onPress}>
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Empty({ text }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

function FormModal({ visible, onClose, title, icon, children, busy, onSubmit, submitLabel = "Save" }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name={icon || "create-outline"} size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{title}</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {children}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={onSubmit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Saving…" : submitLabel}</Text>
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
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: "#fff", margin: 16, marginBottom: 0, borderRadius: 12, padding: 4 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segActive: { backgroundColor: "#0B6E8F" },
  segText: { color: "#6B7B85", fontWeight: "700", fontSize: 13 },
  segTextActive: { color: "#fff" },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 24, lineHeight: 20, paddingHorizontal: 12 },
  groupLabel: { color: "#6B7B85", fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },

  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  amHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  amIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center" },
  amDesc: { color: "#5B6E78", fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  enabledHint: { color: "#8794A0", fontSize: 12, marginTop: 8, fontWeight: "600" },

  sectionLabel: { color: "#48606B", fontWeight: "700", fontSize: 13, marginTop: 14, marginBottom: 8 },
  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minWidth: 96 },
  slotActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  slotLabel: { fontWeight: "800", color: "#1B2B33", fontSize: 13 },
  slotTime: { color: "#6B7B85", fontSize: 11, marginTop: 2 },
  slotPrice: { color: "#0B6E8F", fontWeight: "800", marginTop: 4 },

  day: { borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, alignItems: "center", backgroundColor: "#fff" },
  dayActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  dayDisabled: { backgroundColor: "#F0F3F5", borderColor: "#E4EAED" },
  dayText: { fontWeight: "700", color: "#1B2B33", fontSize: 12 },
  dayTaken: { color: "#B7C1C8", fontSize: 9, marginTop: 1 },

  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 80, textAlignVertical: "top" },

  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 13, marginTop: 14 },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  bkHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  amount: { fontSize: 16, fontWeight: "800", color: "#0B6E8F" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  bkLine: { color: "#334", fontWeight: "600", marginTop: 8 },
  bkWho: { color: "#5B6E78", fontSize: 13, marginTop: 4 },
  bkNote: { color: "#6B7B85", fontStyle: "italic", marginTop: 6 },
  bkRef: { color: "#9AA7AF", fontSize: 12, marginTop: 6 },
  bkActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#2E9E52", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, flex: 1 },
  payBtnText: { color: "#fff", fontWeight: "800" },
  approveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#2E9E52", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, flex: 1 },
  rejectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FBEAEA", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  rejectText: { color: "#B44", fontWeight: "800" },
  ghostBtn: { alignItems: "center", justifyContent: "center", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, borderWidth: 1, borderColor: "#D6DEE3" },
  ghostBtnText: { color: "#6B7B85", fontWeight: "700" },

  slotRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#EEF2F4" },
  slotRowLabel: { fontWeight: "700", color: "#1B2B33" },
  inactiveTag: { color: "#B7C1C8", fontWeight: "600", fontSize: 12 },
  slotRowTime: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
  slotRowPrice: { color: "#0B6E8F", fontWeight: "800" },
  amFooter: { flexDirection: "row", gap: 18, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#EEF2F4" },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  hint: { color: "#6B7B85", fontSize: 12.5, lineHeight: 18, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
