import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Linking,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import ScreenHeader from "../components/ScreenHeader";
import PhotoLightbox from "../components/PhotoLightbox";
import { catMeta, kindMeta } from "./MarketplaceScreen";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const cleanPhone = (p) => String(p || "").replace(/[^\d+]/g, "");
const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function tell(message) {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) window.alert(message);
  else Alert.alert("Buy & Sell", message);
}

function groupThreads(messages) {
  const order = [];
  const map = new Map();
  for (const message of messages || []) {
    const otherId = message.mine ? message.toUserId : message.fromUserId;
    const key = otherId || message.fromUserId || message.id;
    if (!map.has(key)) {
      map.set(key, { id: key, name: message.mine ? "Resident" : message.fromName, flat: message.fromFlat, phone: message.fromPhone, items: [] });
      order.push(key);
    }
    const thread = map.get(key);
    if (!message.mine) {
      thread.name = message.fromName || thread.name;
      thread.flat = message.fromFlat || thread.flat;
      thread.phone = message.fromPhone || thread.phone;
    }
    thread.items.push(message);
  }
  return order.map((key) => map.get(key));
}

export default function ListingDetailScreen({ navigation, route }) {
  const id = route?.params?.id;
  const { width } = useWindowDimensions();
  const [listing, setListing] = useState(null);
  const [photoAt, setPhotoAt] = useState(null);
  const [messages, setMessages] = useState(null);
  const [threadRole, setThreadRole] = useState("buyer");
  const [participants, setParticipants] = useState(null);
  const [draft, setDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [sentNote, setSentNote] = useState("");
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    try {
      const { listing } = await api.listing(id);
      setListing(listing);
      const thread = await api.listingMessages(id).catch(() => ({ messages: [], role: listing.isOwner ? "seller" : "buyer" }));
      setMessages(thread.messages || []);
      setThreadRole(thread.role || (listing.isOwner ? "seller" : "buyer"));
      if (listing.isOwner && (listing.kind === "group_buy" || listing.kind === "borrow")) {
        const { participants } = await api.listingParticipants(id).catch(() => ({ participants: [] }));
        setParticipants(participants || []);
      }
    } catch (e) {
      tell(e.message);
    }
  }, [id]);

  const toggleJoin = async () => {
    setJoining(true);
    try {
      if (listing.joinedByMe) await api.leaveListing(id);
      else await api.joinListing(id);
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setJoining(false);
    }
  };

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

  const sendMessage = async (text, toUserId) => {
    const body = String(text || "").trim();
    if (!body) {
      tell("Write a message first.");
      return;
    }
    setSending(true);
    try {
      await api.messageListingOwner(id, body, toUserId);
      setSentNote(
        toUserId
          ? "Reply sent. They can read it on this listing and on their home."
          : "Sent. The owner can read this on the listing and on their home."
      );
      if (toUserId) setReplyDrafts((current) => ({ ...current, [toUserId]: "" }));
      else setDraft("");
      await load();
    } catch (e) {
      tell(e.message || "Could not send the message.");
    } finally {
      setSending(false);
    }
  };

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
          <>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {listing.images.map((uri, i) => (
                <TouchableOpacity key={i} activeOpacity={0.92} onPress={() => setPhotoAt(i)} testID="listing-photo">
                  <Image source={{ uri }} resizeMode="contain" style={[styles.hero, { width, objectFit: "contain" }]} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.photoHint}>
              Tap a photo to see it full size{listing.images.length > 1 ? ` · ${listing.images.length} photos` : ""}
            </Text>
            <PhotoLightbox
              visible={photoAt != null}
              uris={listing.images}
              startIndex={photoAt || 0}
              onClose={() => setPhotoAt(null)}
            />
          </>
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
            {listing.visibility === "all" ? " · visible everywhere" : " · same community only"}
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

          {listing.kind && listing.kind !== "sale" && (
            <View style={styles.kindBanner}>
              <Ionicons name={kindMeta(listing.kind).icon} size={16} color="#6D3BD1" />
              <Text style={styles.kindBannerText}>
                {listing.kind === "group_buy"
                  ? "Group buy — join to unlock the bulk deal"
                  : listing.kind === "skill"
                  ? "Skill exchange"
                  : listing.lendMode === "free"
                  ? "Free to a good home"
                  : listing.lendMode === "borrow"
                  ? "Neighbour looking to borrow"
                  : "Available to borrow / lend"}
              </Text>
            </View>
          )}

          {listing.kind === "group_buy" && (
            <View style={styles.gbCard}>
              <View style={styles.gbRow}>
                <Text style={styles.gbCount}>
                  {listing.joinCount || 0}
                  {listing.targetCount ? ` / ${listing.targetCount}` : ""} joined
                </Text>
                {listing.unitPrice != null && <Text style={styles.gbPrice}>{money(listing.unitPrice)}/member</Text>}
              </View>
              {listing.targetCount ? (
                <View style={styles.gbBarBg}>
                  <View style={[styles.gbBarFill, { width: `${Math.min(100, Math.round(((listing.joinCount || 0) / listing.targetCount) * 100))}%` }]} />
                </View>
              ) : null}
              {listing.targetCount && (listing.joinCount || 0) >= listing.targetCount && (
                <Text style={styles.gbReady}>Target reached — the organiser can place the order.</Text>
              )}
            </View>
          )}

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.desc}>{listing.description}</Text>

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

              {(listing.kind === "group_buy" || listing.kind === "borrow") && (
                <>
                  <Text style={styles.sectionTitle}>Joined {participants?.length ? `(${participants.length})` : ""}</Text>
                  {participants === null && <ActivityIndicator color="#0B6E8F" />}
                  {participants?.length === 0 && <Text style={styles.muted}>No one has joined yet.</Text>}
                  {participants?.map((p) => (
                    <View key={p.id} style={styles.enquiry}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.enquiryFrom}>{p.name}{p.flatNo ? ` · ${p.flatNo}` : ""}{p.qty > 1 ? ` · x${p.qty}` : ""}</Text>
                        <Text style={styles.enquiryTime}>{fmt(p.createdAt)}</Text>
                      </View>
                      {p.phone ? (
                        <TouchableOpacity style={styles.callBtn} onPress={() => call(p.phone)}>
                          <Ionicons name="call" size={16} color="#0B6E8F" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </>
              )}
            </>
          ) : null}

          {!listing.isOwner && (listing.kind === "group_buy" || listing.kind === "borrow") && listing.status === "active" ? (
            <TouchableOpacity
              style={[styles.joinBtn, listing.joinedByMe && styles.joinBtnLeave, joining && { opacity: 0.6 }]}
              onPress={toggleJoin}
              disabled={joining}
            >
              <Ionicons name={listing.joinedByMe ? "checkmark-circle" : "add-circle-outline"} size={18} color="#fff" />
              <Text style={styles.joinBtnText}>
                {joining ? "…" : listing.joinedByMe ? "You're in — tap to leave" : listing.kind === "group_buy" ? "Join this group buy" : "I'm interested"}
              </Text>
            </TouchableOpacity>
          ) : null}

          <Conversation
            seller={threadRole === "seller" || listing.isOwner}
            active={listing.status === "active"}
            messages={messages}
            draft={draft}
            onDraft={setDraft}
            replyDrafts={replyDrafts}
            onReplyDraft={(userId, text) => setReplyDrafts((current) => ({ ...current, [userId]: text }))}
            sentNote={sentNote}
            sending={sending}
            onSend={sendMessage}
            onCall={call}
            onWhatsapp={listing.authorPhone ? () => whatsapp(listing.authorPhone, listing.title) : null}
            contactLabel={listing.kind === "group_buy" ? "organiser" : "owner"}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Bubble({ message }) {
  return (
    <View style={[styles.bubble, message.mine ? styles.bubbleMine : styles.bubbleTheirs]} testID="listing-message">
      <Text style={styles.enquiryFrom}>{message.mine ? "You" : message.fromName}{!message.mine && message.fromFlat ? ` · ${message.fromFlat}` : ""}</Text>
      <Text style={styles.enquiryBody}>{message.body}</Text>
      <Text style={styles.enquiryTime}>{fmt(message.createdAt)}</Text>
    </View>
  );
}

function Conversation({ seller, active, messages, draft, onDraft, replyDrafts, onReplyDraft, sentNote, sending, onSend, onCall, onWhatsapp, contactLabel }) {
  const threads = seller ? groupThreads(messages) : [];
  const canWrite = seller || active || (messages && messages.length > 0);
  return (
    <View testID="listing-conversation">
      <Text style={styles.sectionTitle}>Conversation {messages?.length ? `(${messages.length})` : ""}</Text>
      {messages === null && <ActivityIndicator color="#0B6E8F" />}
      {messages?.length === 0 && (
        <Text style={styles.muted}>
          {seller
            ? "No messages yet. When someone messages you about this listing, the conversation shows here and on your home."
            : "No messages yet. Write below — the owner sees it here and on their home."}
        </Text>
      )}
      {seller
        ? threads.map((thread) => (
            <View key={thread.id} style={styles.thread}>
              <View style={styles.threadHead}>
                <Text style={styles.enquiryFrom}>{thread.name}{thread.flat ? ` · ${thread.flat}` : ""}{thread.phone ? ` · ${thread.phone}` : ""}</Text>
                {thread.phone ? (
                  <TouchableOpacity style={styles.callBtn} onPress={() => onCall(thread.phone)}>
                    <Ionicons name="call" size={16} color="#0B6E8F" />
                  </TouchableOpacity>
                ) : null}
              </View>
              {thread.items.map((message) => (
                <Bubble key={message.id} message={message} />
              ))}
              <TextInput
                style={[styles.input, styles.replyInput]}
                value={replyDrafts[thread.id] || ""}
                onChangeText={(text) => onReplyDraft(thread.id, text)}
                placeholder="Reply to this resident"
                testID="listing-reply"
              />
              <TouchableOpacity
                style={[styles.replyBtn, sending && { opacity: 0.6 }]}
                onPress={() => onSend(replyDrafts[thread.id], thread.id)}
                disabled={sending}
                testID="listing-send"
              >
                <Text style={styles.replyBtnText}>{sending ? "Sending…" : "Send reply"}</Text>
              </TouchableOpacity>
            </View>
          ))
        : messages?.map((message) => <Bubble key={message.id} message={message} />)}
      {sentNote ? <Text testID="listing-sent" style={styles.sentNote}>{sentNote}</Text> : null}
      {!seller && canWrite ? (
        <>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={draft}
            onChangeText={onDraft}
            placeholder="Hi, is this still available? Can I see it this weekend?"
            multiline
            testID="listing-reply"
          />
          <View style={styles.buyerActions}>
            <TouchableOpacity style={[styles.msgBtn, sending && { opacity: 0.6 }]} onPress={() => onSend(draft)} disabled={sending} testID="listing-send">
              <Ionicons name="chatbubble-ellipses" size={18} color="#1B2B33" />
              <Text style={styles.msgBtnText}>{sending ? "Sending…" : `Message ${contactLabel}`}</Text>
            </TouchableOpacity>
            {onWhatsapp ? (
              <TouchableOpacity style={styles.waBtn} onPress={onWhatsapp}>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  hero: { height: 340, backgroundColor: "#E7EEF1" },
  photoHint: { color: "#6B7B85", fontSize: 12, fontWeight: "700", paddingHorizontal: 16, paddingTop: 8 },
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
  thread: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 10 },
  threadHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  bubble: { borderRadius: 12, padding: 12, marginBottom: 8 },
  bubbleMine: { backgroundColor: "#E7F6EC" },
  bubbleTheirs: { backgroundColor: "#F4F7F8" },
  sentNote: { color: "#1E7A3D", fontWeight: "700", fontSize: 13, marginTop: 8 },
  replyInput: { marginTop: 4 },
  replyBtn: { alignSelf: "flex-start", backgroundColor: "#0B6E8F", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  replyBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  callBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center" },
  kindBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F5F0FE", borderRadius: 10, padding: 10, marginTop: 12 },
  kindBannerText: { color: "#6D3BD1", fontWeight: "700", fontSize: 12.5, flex: 1 },
  gbCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginTop: 12 },
  gbRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  gbCount: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  gbPrice: { fontWeight: "800", color: "#6D3BD1", fontSize: 14 },
  gbBarBg: { height: 8, borderRadius: 4, backgroundColor: "#EDE7FB", overflow: "hidden" },
  gbBarFill: { height: 8, borderRadius: 4, backgroundColor: "#6D3BD1" },
  gbReady: { color: "#1E7A3D", fontWeight: "700", fontSize: 12.5, marginTop: 8 },
  joinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#6D3BD1", borderRadius: 12, paddingVertical: 15, marginTop: 22 },
  joinBtnLeave: { backgroundColor: "#2E9E52" },
  joinBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  buyerActions: { flexDirection: "row", gap: 12, marginTop: 12 },
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
