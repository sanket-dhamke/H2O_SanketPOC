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
  Image,
  FlatList,
} from "react-native";
import TextInput from "../components/AppTextInput";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import ScreenHeader from "../components/ScreenHeader";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

export const LISTING_CATEGORIES = [
  { id: "furniture", label: "Furniture", icon: "bed-outline" },
  { id: "electronics", label: "Electronics", icon: "tv-outline" },
  { id: "vehicles", label: "Vehicles", icon: "car-outline" },
  { id: "home_decor", label: "Home Decor", icon: "color-palette-outline" },
  { id: "kids", label: "Kids Items", icon: "happy-outline" },
  { id: "food", label: "Food", icon: "fast-food-outline" },
  { id: "services", label: "Services", icon: "construct-outline" },
  { id: "others", label: "Others", icon: "ellipsis-horizontal" },
];
export const catMeta = (id) => LISTING_CATEGORIES.find((c) => c.id === id) || LISTING_CATEGORIES[7];

export default function MarketplaceScreen() {
  const navigation = useNavigation();
  const [listings, setListings] = useState([]);
  const [counts, setCounts] = useState({});
  const [category, setCategory] = useState(null);
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([
        api.listings({ category, mine }),
        api.listingCategories().catch(() => ({ counts: {} })),
      ]);
      setListings(l.listings || []);
      setCounts(c.counts || {});
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, [category, mine]);

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

  const filtered = query.trim()
    ? listings.filter(
        (l) =>
          l.title.toLowerCase().includes(query.toLowerCase()) ||
          l.description.toLowerCase().includes(query.toLowerCase())
      )
    : listings;

  const addBtn = (
    <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="add" size={24} color="#fff" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="pricetags"
        title="Buy & Sell"
        subtitle="Marketplace across societies"
        onBack={() => navigation.goBack()}
        right={addBtn}
      />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#8895A0" />
        <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="What are you looking for?" />
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity style={[styles.toggle, !mine && styles.toggleActive]} onPress={() => setMine(false)}>
          <Text style={[styles.toggleText, !mine && styles.toggleTextActive]}>Browse</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggle, mine && styles.toggleActive]} onPress={() => setMine(true)}>
          <Text style={[styles.toggleText, mine && styles.toggleTextActive]}>My listings</Text>
        </TouchableOpacity>
      </View>

      {!mine && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          <TouchableOpacity style={[styles.catChip, !category && styles.catChipActive]} onPress={() => setCategory(null)}>
            <Text style={[styles.catChipText, !category && { color: "#fff" }]}>All</Text>
          </TouchableOpacity>
          {LISTING_CATEGORIES.map((c) => (
            <TouchableOpacity key={c.id} style={[styles.catChip, category === c.id && styles.catChipActive]} onPress={() => setCategory(c.id)}>
              <Ionicons name={c.icon} size={14} color={category === c.id ? "#fff" : "#0B6E8F"} />
              <Text style={[styles.catChipText, category === c.id && { color: "#fff" }]}>
                {c.label}
                {counts[c.id] ? ` ${counts[c.id]}` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingVertical: 12, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="pricetags-outline" size={30} color="#B7C2C9" />
            <Text style={styles.emptyText}>{mine ? "You haven't listed anything yet." : "No listings here yet. Be the first!"}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate("ListingDetail", { id: item.id })}>
            <View style={styles.thumbWrap}>
              {item.images?.[0] ? (
                <Image source={{ uri: item.images[0] }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Ionicons name={catMeta(item.category).icon} size={30} color="#B7C2C9" />
                </View>
              )}
              {item.price != null && (
                <View style={styles.priceTag}>
                  <Text style={styles.priceTagText}>{money(item.price)}</Text>
                </View>
              )}
              {item.status !== "active" && (
                <View style={styles.soldTag}>
                  <Text style={styles.soldTagText}>{item.status === "sold" ? "SOLD" : "REMOVED"}</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.cardLoc} numberOfLines={1}>{item.location || item.societyName || "—"}</Text>
          </TouchableOpacity>
        )}
      />

      <CreateListingModal visible={modal} onClose={() => setModal(false)} onDone={load} />
    </View>
  );
}

function CreateListingModal({ visible, onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("furniture");
  const [location, setLocation] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [images, setImages] = useState([]); // base64 data URLs
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPrice("");
    setCategory("furniture");
    setLocation("");
    setVisibility("all");
    setImages([]);
  };

  const pickImage = async () => {
    if (images.length >= 4) {
      Alert.alert("Limit reached", "You can add up to 4 photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true, allowsEditing: true, aspect: [4, 3] });
    if (!result.canceled && result.assets?.[0]?.base64) {
      setImages((im) => [...im, `data:image/jpeg;base64,${result.assets[0].base64}`]);
    }
  };

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Missing info", "Enter a title and description.");
      return;
    }
    setBusy(true);
    try {
      await api.createListing({
        title: title.trim(),
        description: description.trim(),
        price: price ? Number(price) : undefined,
        category,
        location: location.trim() || undefined,
        visibility,
        images,
      });
      reset();
      onClose();
      onDone();
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
              <Ionicons name="pricetag-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>List an item</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 540 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Photos (up to 4)</Label>
            <View style={styles.imgRow}>
              {images.map((uri, i) => (
                <View key={i} style={styles.imgThumbWrap}>
                  <Image source={{ uri }} style={styles.imgThumb} />
                  <TouchableOpacity style={styles.imgRemove} onPress={() => setImages((im) => im.filter((_, idx) => idx !== i))}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < 4 && (
                <TouchableOpacity style={styles.imgAdd} onPress={pickImage}>
                  <Ionicons name="camera-outline" size={22} color="#0B6E8F" />
                </TouchableOpacity>
              )}
            </View>
            <Label>Category</Label>
            <View style={styles.catPick}>
              {LISTING_CATEGORIES.map((c) => (
                <TouchableOpacity key={c.id} style={[styles.catOpt, category === c.id && styles.catOptActive]} onPress={() => setCategory(c.id)}>
                  <Ionicons name={c.icon} size={14} color={category === c.id ? "#fff" : "#0B6E8F"} />
                  <Text style={[styles.catOptText, category === c.id && { color: "#fff" }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label>Title</Label>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Sofa set 3+2 seating" />
            <Label>Price (Rs., optional)</Label>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="15000" keyboardType="numeric" />
            <Label>Description</Label>
            <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Condition, age, reason for selling…" multiline />
            <Label>Location (optional)</Label>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Tower B, Wing 2" />
            <Label>Who can see this?</Label>
            <View style={styles.visRow}>
              <TouchableOpacity style={[styles.visOpt, visibility === "all" && styles.visActive]} onPress={() => setVisibility("all")}>
                <Ionicons name="globe-outline" size={16} color={visibility === "all" ? "#fff" : "#0B6E8F"} />
                <Text style={[styles.visText, visibility === "all" && { color: "#fff" }]}>All societies</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.visOpt, visibility === "society" && styles.visActive]} onPress={() => setVisibility("society")}>
                <Ionicons name="home-outline" size={16} color={visibility === "society" ? "#fff" : "#0B6E8F"} />
                <Text style={[styles.visText, visibility === "society" && { color: "#fff" }]}>My society only</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.mCancel]} onPress={onClose}>
                <Text style={styles.mCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.mBtnText}>{busy ? "Posting…" : "Post listing"}</Text>
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
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", marginHorizontal: 16, marginTop: 12, borderRadius: 12, paddingHorizontal: 14 },
  search: { flex: 1, paddingVertical: 12, fontSize: 15 },
  toggleRow: { flexDirection: "row", backgroundColor: "#fff", margin: 16, marginBottom: 6, borderRadius: 12, padding: 4 },
  toggle: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  toggleActive: { backgroundColor: "#0B6E8F" },
  toggleText: { color: "#6B7B85", fontWeight: "700", fontSize: 13 },
  toggleTextActive: { color: "#fff" },
  catRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#fff", height: 36 },
  catChipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  catChipText: { color: "#0B6E8F", fontSize: 12.5, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10, width: "100%" },
  emptyText: { color: "#8895A0", fontSize: 14, fontWeight: "600", textAlign: "center", paddingHorizontal: 24 },
  card: { flex: 1, backgroundColor: "#fff", borderRadius: 14, overflow: "hidden", marginBottom: 0 },
  thumbWrap: { position: "relative" },
  thumb: { width: "100%", height: 130, backgroundColor: "#EEF2F4" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  priceTag: { position: "absolute", left: 8, bottom: 8, backgroundColor: "rgba(11,110,143,0.92)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  priceTagText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  soldTag: { position: "absolute", right: 8, top: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  soldTagText: { color: "#fff", fontWeight: "800", fontSize: 10 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#1B2B33", paddingHorizontal: 10, paddingTop: 8 },
  cardLoc: { fontSize: 12, color: "#8895A0", paddingHorizontal: 10, paddingBottom: 10, paddingTop: 2 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  imgRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  imgThumbWrap: { position: "relative" },
  imgThumb: { width: 64, height: 64, borderRadius: 10 },
  imgRemove: { position: "absolute", right: -6, top: -6, backgroundColor: "#B44", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  imgAdd: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, borderColor: "#CFE0E6", borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFB" },
  catPick: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catOpt: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  catOptActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  catOptText: { color: "#0B6E8F", fontSize: 12, fontWeight: "700" },
  visRow: { flexDirection: "row", gap: 10 },
  visOpt: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 10, paddingVertical: 12 },
  visActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  visText: { color: "#0B6E8F", fontWeight: "700", fontSize: 12.5 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  mBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "700" },
  mCancel: { backgroundColor: "#EEF2F4" },
  mCancelText: { color: "#6B7B85", fontWeight: "700" },
});
