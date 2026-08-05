import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
  Platform,
} from "react-native";
import TextInput from "../../components/AppTextInput";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../lib/api";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString() : "");

// Cross-platform confirm (RN Alert is a no-op on web).
function confirm(title, message, onYes, yesLabel = "Delete") {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: yesLabel, style: "destructive", onPress: onYes },
  ]);
}

// Full-screen moderation console for the GateMate owner: browse every Buy & Sell
// post across all societies and disable (hide) or delete anything inappropriate.
export default function MarketplaceModerationModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState([]);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (q) => {
    try {
      const { listings } = await api.moderationListings(q);
      setListings(listings || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useEffect(() => {
    if (visible) load(query.trim() || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(query.trim() || undefined);
    setRefreshing(false);
  };

  const setStatus = async (item, status) => {
    setBusyId(item.id);
    try {
      await api.moderateListingStatus(item.id, status);
      setListings((prev) => prev.map((l) => (l.id === item.id ? { ...l, status } : l)));
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = (item) =>
    confirm(
      "Delete post",
      `Permanently delete "${item.title}" by ${item.authorName || "resident"}? This cannot be undone.`,
      async () => {
        setBusyId(item.id);
        try {
          await api.moderateDeleteListing(item.id);
          setListings((prev) => prev.filter((l) => l.id !== item.id));
        } catch (e) {
          Alert.alert("Error", e.message);
        } finally {
          setBusyId(null);
        }
      }
    );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <LinearGradient
          colors={["#0E85AC", "#0B6E8F", "#075064"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 14 }]}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="pricetags" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Buy &amp; Sell moderation</Text>
              <Text style={styles.headerSub}>Disable or delete posts across all societies</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="#8895A0" />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => load(query.trim() || undefined)}
              placeholder="Search title, seller, society…"
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity onPress={() => { setQuery(""); load(); }}>
                <Ionicons name="close-circle" size={18} color="#8895A0" />
              </TouchableOpacity>
            ) : null}
          </View>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {listings.length === 0 && <Text style={styles.empty}>No posts found.</Text>}
          {listings.map((item) => {
            const disabled = item.status === "removed";
            const sold = item.status === "sold";
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardTop}>
                  {item.images?.[0] ? (
                    <Image source={{ uri: item.images[0] }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Ionicons name="image-outline" size={22} color="#B7C2C9" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                    {item.price != null && <Text style={styles.price}>{money(item.price)}</Text>}
                    <Text style={styles.meta} numberOfLines={1}>
                      {item.authorName || "Resident"}
                      {item.flatNo ? ` · ${item.flatNo}` : ""}
                      {item.societyName ? ` · ${item.societyName}` : ""}
                    </Text>
                    <Text style={styles.meta2} numberOfLines={1}>
                      {item.category} · {item.visibility === "all" ? "Everywhere" : "One community"} · {fmt(item.createdAt)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusChip,
                      disabled ? styles.chipRemoved : sold ? styles.chipSold : styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: disabled ? "#B4381F" : sold ? "#6B7B85" : "#1E7A3D" },
                      ]}
                    >
                      {disabled ? "Disabled" : sold ? "Sold" : "Active"}
                    </Text>
                  </View>
                </View>

                {!!item.description && (
                  <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
                )}

                <View style={styles.actions}>
                  {disabled ? (
                    <TouchableOpacity
                      style={[styles.btn, styles.enableBtn, busyId === item.id && { opacity: 0.5 }]}
                      disabled={busyId === item.id}
                      onPress={() => setStatus(item, "active")}
                    >
                      <Ionicons name="eye-outline" size={16} color="#1E7A3D" />
                      <Text style={[styles.btnText, { color: "#1E7A3D" }]}>Enable</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.btn, styles.disableBtn, busyId === item.id && { opacity: 0.5 }]}
                      disabled={busyId === item.id}
                      onPress={() => setStatus(item, "removed")}
                    >
                      <Ionicons name="eye-off-outline" size={16} color="#B0620B" />
                      <Text style={[styles.btnText, { color: "#B0620B" }]}>Disable</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.btn, styles.deleteBtn, busyId === item.id && { opacity: 0.5 }]}
                    disabled={busyId === item.id}
                    onPress={() => remove(item)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#B4381F" />
                    <Text style={[styles.btnText, { color: "#B4381F" }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  header: { paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "#CDE9F2", fontSize: 12.5, marginTop: 2 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 14 },
  search: { flex: 1, fontSize: 15, color: "#1B2B33" },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 30 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 12 },
  cardTop: { flexDirection: "row", gap: 12 },
  thumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: "#EEF2F4" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "800", color: "#1B2B33" },
  price: { color: "#0B6E8F", fontWeight: "800", fontSize: 14, marginTop: 1 },
  meta: { color: "#48606B", fontSize: 12.5, marginTop: 2 },
  meta2: { color: "#9AA7AF", fontSize: 11.5, marginTop: 2 },
  statusChip: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  chipActive: { backgroundColor: "#E3F5E8" },
  chipRemoved: { backgroundColor: "#FDEAE6" },
  chipSold: { backgroundColor: "#EEF2F4" },
  statusText: { fontSize: 11, fontWeight: "800" },
  desc: { color: "#48606B", fontSize: 13, marginTop: 10, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10, borderWidth: 1 },
  disableBtn: { backgroundColor: "#FEF3E2", borderColor: "#F3D6A8" },
  enableBtn: { backgroundColor: "#E3F5E8", borderColor: "#BCE4C8" },
  deleteBtn: { backgroundColor: "#FDEAE6", borderColor: "#F3C6BC" },
  btnText: { fontWeight: "800", fontSize: 13 },
});
