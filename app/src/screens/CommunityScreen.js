import React, { useCallback, useState } from "react";
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
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const CATEGORIES = [
  { id: "general", label: "General", icon: "chatbubbles-outline" },
  { id: "sale", label: "For sale", icon: "pricetag-outline" },
  { id: "query", label: "Question", icon: "help-circle-outline" },
  { id: "lost_found", label: "Lost & found", icon: "search-outline" },
  { id: "recommend", label: "Recommend", icon: "thumbs-up-outline" },
];
const catMeta = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];

export default function CommunityScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState("announcements");
  const [announcements, setAnnouncements] = useState([]);
  const [posts, setPosts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [annModal, setAnnModal] = useState(false);
  const [postModal, setPostModal] = useState(false);

  const isAdmin = user?.role === "admin";
  const canPost = user?.role === "resident" || user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([api.announcements(), api.posts()]);
      setAnnouncements(a.announcements || []);
      setPosts(p.posts || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const removeAnnouncement = (id) =>
    Alert.alert("Delete announcement", "Remove this announcement?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteAnnouncement(id);
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);

  const removePost = (id) =>
    Alert.alert("Delete post", "Remove this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deletePost(id);
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);

  const showAdd =
    (tab === "announcements" && isAdmin) || (tab === "posts" && canPost);
  const addBtn = showAdd ? (
    <TouchableOpacity
      onPress={() => (tab === "announcements" ? setAnnModal(true) : setPostModal(true))}
      style={styles.addBtn}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  ) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader icon="megaphone" title="Community" subtitle="Announcements & neighbours' board" right={addBtn} />

      <View style={styles.segment}>
        <Seg label="Announcements" active={tab === "announcements"} onPress={() => setTab("announcements")} />
        <Seg label={`Board${posts.length ? ` (${posts.length})` : ""}`} active={tab === "posts"} onPress={() => setTab("posts")} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {tab === "announcements" ? (
          <>
            {announcements.length === 0 && <Empty text="No announcements yet." />}
            {announcements.map((a) => (
              <View key={a.id} style={styles.card}>
                <View style={styles.cardHead}>
                  {a.pinned && (
                    <View style={styles.pin}>
                      <Ionicons name="pin" size={12} color="#C2571A" />
                      <Text style={styles.pinText}>Pinned</Text>
                    </View>
                  )}
                  <Text style={styles.time}>{timeAgo(a.createdAt)}</Text>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => removeAnnouncement(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={18} color="#B44" />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.title}>{a.title}</Text>
                <Text style={styles.body}>{a.body}</Text>
                {!!a.authorName && <Text style={styles.author}>— {a.authorName}</Text>}
              </View>
            ))}
          </>
        ) : (
          <>
            {posts.length === 0 && <Empty text="No posts yet. Be the first to share something!" />}
            {posts.map((p) => {
              const meta = catMeta(p.category);
              const canDelete = isAdmin || p.authorId === user?.id;
              return (
                <View key={p.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={styles.catChip}>
                      <Ionicons name={meta.icon} size={12} color="#0B6E8F" />
                      <Text style={styles.catText}>{meta.label}</Text>
                    </View>
                    <Text style={styles.time}>{timeAgo(p.createdAt)}</Text>
                    {canDelete && (
                      <TouchableOpacity onPress={() => removePost(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={18} color="#B44" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, { flex: 1 }]}>{p.title}</Text>
                    {p.category === "sale" && p.price != null && (
                      <Text style={styles.price}>{money(p.price)}</Text>
                    )}
                  </View>
                  <Text style={styles.body}>{p.body}</Text>
                  <Text style={styles.author}>
                    {p.authorName}
                    {p.flatNo ? ` · ${p.flatNo}` : ""}
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <AnnouncementModal visible={annModal} onClose={() => setAnnModal(false)} onDone={load} />
      <PostModal visible={postModal} onClose={() => setPostModal(false)} onDone={load} />
    </View>
  );
}

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

function AnnouncementModal({ visible, onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing info", "Enter a title and message.");
      return;
    }
    setBusy(true);
    try {
      await api.createAnnouncement({ title: title.trim(), body: body.trim(), pinned });
      setTitle("");
      setBody("");
      setPinned(false);
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal visible={visible} onClose={onClose} title="New announcement" icon="megaphone-outline" busy={busy} onSubmit={submit}>
      <Label>Title</Label>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Water supply maintenance" />
      <Label>Message</Label>
      <TextInput style={[styles.input, styles.multiline]} value={body} onChangeText={setBody} placeholder="Details residents should know…" multiline />
      <TouchableOpacity style={styles.checkRow} onPress={() => setPinned((p) => !p)}>
        <Ionicons name={pinned ? "checkbox" : "square-outline"} size={22} color="#0B6E8F" />
        <Text style={styles.checkText}>Pin to top</Text>
      </TouchableOpacity>
    </FormModal>
  );
}

function PostModal({ visible, onClose, onDone }) {
  const [category, setCategory] = useState("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing info", "Enter a title and details.");
      return;
    }
    setBusy(true);
    try {
      await api.createPost({
        category,
        title: title.trim(),
        body: body.trim(),
        price: category === "sale" && price ? Number(price) : undefined,
      });
      setCategory("general");
      setTitle("");
      setBody("");
      setPrice("");
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal visible={visible} onClose={onClose} title="New post" icon="create-outline" busy={busy} onSubmit={submit}>
      <Label>Category</Label>
      <View style={styles.catPick}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.catOpt, category === c.id && styles.catOptActive]}
            onPress={() => setCategory(c.id)}
          >
            <Ionicons name={c.icon} size={14} color={category === c.id ? "#fff" : "#0B6E8F"} />
            <Text style={[styles.catOptText, category === c.id && { color: "#fff" }]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Label>Title</Label>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Sofa set for sale" />
      {category === "sale" && (
        <>
          <Label>Price (Rs.)</Label>
          <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="12000" keyboardType="numeric" />
        </>
      )}
      <Label>Details</Label>
      <TextInput style={[styles.input, styles.multiline]} value={body} onChangeText={setBody} placeholder="Describe your post…" multiline />
    </FormModal>
  );
}

function FormModal({ visible, onClose, title, icon, children, busy, onSubmit }) {
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
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {children}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={onSubmit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Posting…" : "Post"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: "#fff", margin: 16, marginBottom: 0, borderRadius: 12, padding: 4 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segActive: { backgroundColor: "#0B6E8F" },
  segText: { color: "#6B7B85", fontWeight: "700", fontSize: 13 },
  segTextActive: { color: "#fff" },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 30 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  pin: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FBEadd", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  pinText: { color: "#C2571A", fontSize: 11, fontWeight: "700" },
  catChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EAF4F7", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  catText: { color: "#0B6E8F", fontSize: 11, fontWeight: "700" },
  time: { flex: 1, color: "#9AA7AF", fontSize: 11 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  price: { fontSize: 16, fontWeight: "800", color: "#2E9E52" },
  body: { color: "#48606B", marginTop: 6, lineHeight: 20 },
  author: { color: "#9AA7AF", fontSize: 12, marginTop: 10, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  checkText: { color: "#1B2B33", fontWeight: "600" },
  catPick: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catOpt: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  catOptActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  catOptText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
