import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  Linking,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import ScreenHeader from "../components/ScreenHeader";
import { catMeta } from "./MarketplaceScreen";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const { width } = Dimensions.get("window");
const cleanPhone = (p) => String(p || "").replace(/[^\d+]/g, "");
const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function ListingDetailScreen({ navigation, route }) {
  const id = route?.params?.id;
  const [listing, setListing] = useState(null);
  const [messages, setMessages] = useState(null);
  const [msgModal, setMsgModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const { listing } = await api.listing(id);
      setListing(listing);
      if (listing.isOwner) {
        const { messages } = await api.listingMessages(id).catch(() => ({ messages: [] }));
        setMessages(messages || []);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const setStatus = async (status) => {
    try {
      const { listing } = await api.updateListing(id, { status });
      setListing(listing);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const remove = () =>
    Alert.alert("Delete listing", "Remove this listing permanently?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteListing(id);
            navigation.goBack();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);

  const call = (phone) => Linking.openURL(`tel:${cleanPhone(phone)}`).catch(() => {});
  const whatsapp = (phone, title) =>
    Linking.openURL(`https://wa.me/${cleanPhone(phone).replace(/^\+/, "")}?text=${encodeURIComponent(`Hi, is "${title}" still available?`)}`).catch(() =>
      Alert.alert("WhatsApp unavailable", "Couldn't open WhatsApp for this number.")
    );

  if (!listing) {
    return (
      <View style={styles.container}>
        <ScreenHeader icon="pricetags" title="Listing" onBack={() => navigation.goBack()} />
        <ActivityIndicator color="#0B6E8F" style={{ marginTop: 40 }} />
      </View>
    );
  }

  const meta = catMeta(listing.category);

  return (
    <View style={styles.container}>
      <ScreenHeader icon="pricetags" title="Product details" subtitle={meta.label} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {listing.images?.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {listing.images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={[styles.hero, { width }]} />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder, { width }]}>
            <Ionicons name={meta.icon} size={54} color="#B7C2C9" />
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{listing.title}</Text>
            {listing.price != null && <Text style={styles.price}>{money(listing.price)}</Text>}
          </View>
          <Text style={styles.loc}>
            {listing.location || listing.societyName}
            {listing.visibility === "all" ? " · visible to all societies" : " · your society only"}
          </Text>
          <Text style={styles.seller}>
            {listing.authorName}
            {listing.flatNo ? ` · ${listing.flatNo}` : ""}
            {listing.societyName ? ` · ${listing.societyName}` : ""} · {fmt(listing.createdAt)}
          </Text>

          {listing.status !== "active" && (
            <View style={styles.statusBanner}>
              <Text style={styles.statusBannerText}>This item is marked {listing.status.toUpperCase()}.</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.desc}>{listing.description}</Text>

          {/* Owner view: manage + enquiries */}
          {listing.isOwner ? (
            <>
              <View style={styles.ownerActions}>
                {listing.status === "active" ? (
                  <TouchableOpacity style={[styles.ownerBtn, { backgroundColor: "#2E9E52" }]} onPress={() => setStatus("sold")}>
                    <Ionicons name="checkmark-done" size={16} color="#fff" />
                    <Text style={styles.ownerBtnText}>Mark sold</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.ownerBtn, { backgroundColor: "#0B6E8F" }]} onPress={() => setStatus("active")}>
                    <Ionicons name="refresh" size={16} color="#fff" />
                    <Text style={styles.ownerBtnText}>Relist</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.ownerBtn, { backgroundColor: "#B44" }]} onPress={remove}>
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                  <Text style={styles.ownerBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionTitle}>Enquiries {messages?.length ? `(${messages.length})` : ""}</Text>
              {messages === null && <ActivityIndicator color="#0B6E8F" />}
              {messages?.length === 0 && <Text style={styles.muted}>No enquiries yet.</Text>}
              {messages?.map((m) => (
                <View key={m.id} style={styles.enquiry}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.enquiryFrom}>{m.fromName}{m.fromPhone ? ` · ${m.fromPhone}` : ""}</Text>
                    <Text style={styles.enquiryBody}>{m.body}</Text>
                    <Text style={styles.enquiryTime}>{fmt(m.createdAt)}</Text>
                  </View>
                  {m.fromPhone ? (
                    <TouchableOpacity style={styles.callBtn} onPress={() => call(m.fromPhone)}>
                      <Ionicons name="call" size={16} color="#0B6E8F" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </>
          ) : (
            listing.status === "active" && (
              <View style={styles.buyerActions}>
                <TouchableOpacity style={styles.msgBtn} onPress={() => setMsgModal(true)}>
                  <Ionicons name="chatbubble-ellipses" size={18} color="#1B2B33" />
                  <Text style={styles.msgBtnText}>Message owner</Text>
                </TouchableOpacity>
                {listing.authorPhone && (
                  <TouchableOpacity style={styles.waBtn} onPress={() => whatsapp(listing.authorPhone, listing.title)}>
                    <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            )
          )}
        </View>
      </ScrollView>

      <MessageModal
        visible={msgModal}
        onClose={() => setMsgModal(false)}
        listingId={id}
        title={listing.title}
      />
    </View>
  );
}

function MessageModal({ visible, onClose, listingId, title }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.messageListingOwner(listingId, body.trim());
      setBody("");
      onClose();
      Alert.alert("Sent", "The owner has been notified and will get back to you.");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Message owner</Text>
          </LinearGradient>
          <View style={styles.modalBody}>
            <Text style={styles.modalHint}>About: {title}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={body}
              onChangeText={setBody}
              placeholder="Hi, is this still available? Can I see it this weekend?"
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.mCancel]} onPress={onClose}>
                <Text style={styles.mCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={send} disabled={busy}>
                <Text style={styles.mBtnText}>{busy ? "Sending…" : "Send"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  hero: { height: 260, backgroundColor: "#EEF2F4" },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },
  body: { padding: 16 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: "#1B2B33" },
  price: { fontSize: 20, fontWeight: "800", color: "#2E9E52" },
  loc: { color: "#6B7B85", fontSize: 13, marginTop: 6 },
  seller: { color: "#9AA7AF", fontSize: 12, marginTop: 8, fontWeight: "600" },
  statusBanner: { backgroundColor: "#FBE9E9", borderRadius: 8, padding: 10, marginTop: 12 },
  statusBannerText: { color: "#B44", fontWeight: "700", fontSize: 12.5 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 20, marginBottom: 8 },
  desc: { color: "#48606B", lineHeight: 21, fontSize: 14 },
  ownerActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  ownerBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 12 },
  ownerBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  muted: { color: "#8895A0", fontSize: 13 },
  enquiry: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  enquiryFrom: { fontWeight: "700", color: "#1B2B33", fontSize: 13.5 },
  enquiryBody: { color: "#48606B", marginTop: 3, fontSize: 13.5 },
  enquiryTime: { color: "#9AA7AF", fontSize: 11, marginTop: 4 },
  callBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center" },
  buyerActions: { flexDirection: "row", gap: 12, marginTop: 22 },
  msgBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FFD54A", borderRadius: 12, paddingVertical: 15 },
  msgBtnText: { color: "#1B2B33", fontWeight: "800", fontSize: 15 },
  waBtn: { width: 54, borderRadius: 12, backgroundColor: "#25A366", alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20 },
  modalHint: { color: "#6B7B85", fontSize: 13, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 18 },
  mBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "700" },
  mCancel: { backgroundColor: "#EEF2F4" },
  mCancelText: { color: "#6B7B85", fontWeight: "700" },
});
