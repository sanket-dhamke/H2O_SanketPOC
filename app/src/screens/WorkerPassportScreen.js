import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { brand } from "../lib/brand";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";
import { workerCat, Stars } from "./WorkersScreen";

const cleanPhone = (p) => String(p || "").replace(/[^\d+]/g, "");
const qrUrlFor = (code) => `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(code)}`;

export default function WorkerPassportScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { id, code } = route.params || {};
  const { user } = useAuth();
  const isStaff = user?.role === "guard" || user?.role === "admin";

  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myStars, setMyStars] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [busyGate, setBusyGate] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = code ? await api.workerByCode(code) : await api.worker(id);
      setWorker(r.worker);
      setMyStars(r.worker?.myRating?.stars || 0);
      setMyComment(r.worker?.myRating?.comment || "");
      if (isStaff && r.worker?.id) {
        const a = await api.workerAttendance(r.worker.id).catch(() => ({ attendance: [] }));
        setAttendance(a.attendance || []);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [id, code, isStaff]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const submitRating = async () => {
    if (!myStars) return Alert.alert("Pick a rating", "Tap 1–5 stars first.");
    setSaving(true);
    try {
      const r = await api.rateWorker(worker.id, { stars: myStars, comment: myComment.trim() || undefined });
      setWorker(r.worker);
      Alert.alert("Thanks!", "Your rating now travels with this worker across every society.");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const openAttendance = attendance.find((a) => !a.outAt);
  const gateAction = async () => {
    setBusyGate(true);
    try {
      if (openAttendance) {
        await api.workerCheckOut(openAttendance.id);
      } else {
        await api.workerCheckIn(worker.id);
      }
      const a = await api.workerAttendance(worker.id);
      setAttendance(a.attendance || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusyGate(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader icon="ribbon" title="Trust Passport" onBack={() => navigation.goBack()} />
        <View style={styles.loading}><ActivityIndicator color="#0B6E8F" /></View>
      </View>
    );
  }
  if (!worker) return null;
  const meta = workerCat(worker.category);

  return (
    <View style={styles.container}>
      <ScreenHeader icon="ribbon" title="Trust Passport" subtitle={worker.subtype || meta.label} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Identity */}
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: meta.color + "1A" }]}>
            {worker.photoUrl ? <Image source={{ uri: worker.photoUrl }} style={styles.avatarImg} /> : <Ionicons name={meta.icon} size={30} color={meta.color} />}
          </View>
          <Text style={styles.name}>{worker.name}</Text>
          <View style={styles.ratingRow}>
            <Stars value={worker.rating} size={18} />
            <Text style={styles.ratingBig}>{worker.reviewCount ? worker.rating.toFixed(1) : "New"}</Text>
          </View>
          <Text style={styles.metaLine}>
            {worker.reviewCount} review{worker.reviewCount === 1 ? "" : "s"} · served {worker.societiesServed} societ{worker.societiesServed === 1 ? "y" : "ies"}
          </Text>
          {!!worker.idProof && (
            <View style={styles.verified}>
              <Ionicons name="shield-checkmark" size={13} color="#1E7A3D" />
              <Text style={styles.verifiedText}>{worker.idProof}</Text>
            </View>
          )}
          <View style={styles.actionsRow}>
            {!!worker.phone && (
              <>
                <TouchableOpacity style={styles.actBtn} onPress={() => Linking.openURL(`tel:${cleanPhone(worker.phone)}`)}>
                  <Ionicons name="call" size={16} color="#0B6E8F" />
                  <Text style={styles.actText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actBtn} onPress={() => Linking.openURL(`https://wa.me/91${cleanPhone(worker.phone).replace(/^\+?91/, "")}`)}>
                  <Ionicons name="logo-whatsapp" size={16} color="#25A366" />
                  <Text style={styles.actText}>WhatsApp</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.actBtn} onPress={() => setShowQr((s) => !s)}>
              <Ionicons name="qr-code" size={16} color="#6D3BD1" />
              <Text style={styles.actText}>Pass QR</Text>
            </TouchableOpacity>
          </View>
          {showQr && (
            <View style={styles.qrWrap}>
              <Image source={{ uri: qrUrlFor(worker.code) }} style={styles.qr} />
              <Text style={styles.qrHint}>The worker carries this. Any {brand.name} gate can scan it to see this passport.</Text>
            </View>
          )}
        </View>

        {/* Guard/admin: gate attendance */}
        {isStaff && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Gate attendance (this society)</Text>
            <TouchableOpacity style={[styles.gateBtn, openAttendance && styles.gateBtnOut, busyGate && { opacity: 0.6 }]} onPress={gateAction} disabled={busyGate}>
              <Ionicons name={openAttendance ? "log-out-outline" : "log-in-outline"} size={18} color="#fff" />
              <Text style={styles.gateBtnText}>{busyGate ? "…" : openAttendance ? "Log exit" : "Log entry"}</Text>
            </TouchableOpacity>
            {attendance.slice(0, 5).map((a) => (
              <View key={a.id} style={styles.attRow}>
                <Text style={styles.attDate}>{a.date}</Text>
                <Text style={styles.attTime}>
                  in {new Date(a.inAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {a.outAt ? ` · out ${new Date(a.outAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : " · inside"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Your rating */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{worker.myRating ? "Your rating" : "Rate this worker"}</Text>
          <View style={styles.starPick}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setMyStars(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Ionicons name={myStars >= n ? "star" : "star-outline"} size={34} color="#F0A500" />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={[styles.input, styles.multiline]} value={myComment} onChangeText={setMyComment} placeholder="Share a few words (optional) — punctuality, work quality…" multiline />
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={submitRating} disabled={saving}>
            <Text style={styles.saveText}>{saving ? "Saving…" : worker.myRating ? "Update rating" : "Submit rating"}</Text>
          </TouchableOpacity>
        </View>

        {/* Reviews */}
        <Text style={styles.sectionTitle}>What residents say</Text>
        {worker.reviews.length === 0 ? (
          <Text style={styles.noReviews}>No written reviews yet. Be the first!</Text>
        ) : (
          worker.reviews.map((rv, i) => (
            <View key={i} style={styles.review}>
              <View style={styles.reviewTop}>
                <Stars value={rv.stars} />
                <Text style={styles.reviewBy}>{rv.by || "A resident"}</Text>
              </View>
              {!!rv.comment && <Text style={styles.reviewBody}>{rv.comment}</Text>}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: "#fff", borderRadius: 16, padding: 20, alignItems: "center" },
  avatar: { width: 76, height: 76, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 76, height: 76 },
  name: { fontSize: 20, fontWeight: "800", color: "#1B2B33", marginTop: 12 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  ratingBig: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  metaLine: { color: "#6B7B85", fontSize: 12.5, marginTop: 4 },
  verified: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EAF7EF", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 },
  verifiedText: { color: "#1E7A3D", fontWeight: "700", fontSize: 12 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  actBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#F1F6F8", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  actText: { fontWeight: "700", color: "#1B2B33", fontSize: 12.5 },
  qrWrap: { alignItems: "center", marginTop: 16 },
  qr: { width: 200, height: 200 },
  qrHint: { color: "#8895A0", fontSize: 12, textAlign: "center", marginTop: 8, paddingHorizontal: 20 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginTop: 14 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginBottom: 12 },
  gateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#1E7A3D", borderRadius: 12, paddingVertical: 13 },
  gateBtnOut: { backgroundColor: "#C2571A" },
  gateBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  attRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#EEF2F4", marginTop: 8 },
  attDate: { color: "#1B2B33", fontWeight: "700", fontSize: 13 },
  attTime: { color: "#6B7B85", fontSize: 12.5 },
  starPick: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  saveBtn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 12 },
  saveText: { color: "#fff", fontWeight: "800" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 20, marginBottom: 10 },
  noReviews: { color: "#8895A0", fontSize: 13.5 },
  review: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  reviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewBy: { color: "#6B7B85", fontWeight: "700", fontSize: 12.5 },
  reviewBody: { color: "#48606B", fontSize: 13.5, marginTop: 8, lineHeight: 19 },
});
