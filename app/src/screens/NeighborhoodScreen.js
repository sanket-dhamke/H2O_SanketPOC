import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import ScreenHeader from "../components/ScreenHeader";
import AppTextInput from "../components/AppTextInput";
import Avatar from "../components/Avatar";
import NeighborhoodPostCard from "../components/NeighborhoodPostCard";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { body } from "../lib/type";

const KINDS = [
  { id: "post", label: "Update", icon: "chatbubble-ellipses-outline" },
  { id: "problem", label: "Problem", icon: "alert-circle-outline" },
  { id: "poll", label: "Poll", icon: "stats-chart-outline" },
];
const AUDIENCE = [
  { id: "followers", label: "Followers", icon: "people" },
  { id: "society", label: "My society", icon: "business" },
  { id: "area", label: "This area", icon: "location" },
];

function FollowPill({ person, onChange }) {
  const [busy, setBusy] = useState(false);
  async function act(e) {
    e?.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      if (person.follow === "none") await api.requestFollow(person.id);
      else if (person.follow === "incoming") await api.acceptFollow(person.followId);
      await onChange();
    } finally {
      setBusy(false);
    }
  }
  if (person.follow === "accepted") {
    return (
      <View style={[styles.pill, styles.pillGhost]}>
        <Ionicons name="checkmark" size={14} color="#0F6E56" />
        <Text style={[styles.pillLabel, { color: "#0F6E56" }]}>Following</Text>
      </View>
    );
  }
  if (person.follow === "requested") {
    return (
      <View style={[styles.pill, styles.pillGhost]}>
        <Text style={[styles.pillLabel, { color: "#6B7B84" }]}>Requested</Text>
      </View>
    );
  }
  const solid = person.follow === "none" || person.follow === "incoming";
  return (
    <TouchableOpacity style={[styles.pill, solid ? styles.pillSolid : styles.pillGhost]} onPress={act} disabled={busy}>
      <Text style={[styles.pillLabel, solid && { color: "#fff" }]}>{person.follow === "incoming" ? "Accept" : "Follow"}</Text>
    </TouchableOpacity>
  );
}

export default function NeighborhoodScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [tab, setTab] = useState("feed");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bodyText, setBodyText] = useState("");
  const [images, setImages] = useState([]); // base64 data URLs, like Buy & Sell
  const [kind, setKind] = useState("post");
  const [visibility, setVisibility] = useState("society");
  const [pollOptions, setPollOptions] = useState("");
  const [people, setPeople] = useState([]);
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  const loadFeed = useCallback(async () => {
    try {
      const data = await api.neighborhoodFeed();
      setPosts(data.posts || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPeople = useCallback(async (q = query) => {
    const [found, incoming] = await Promise.all([api.neighborhoodPeople(q), api.neighborhoodRequests()]);
    setPeople(found.people || []);
    setRequests(incoming.requests || []);
  }, [query]);

  useFocusEffect(useCallback(() => { loadFeed(); }, [loadFeed]));

  const openProfile = (userId, name) => navigation.navigate("NeighborhoodProfile", { userId, name });

  const MAX_PHOTOS = 4;
  const remaining = () => MAX_PHOTOS - images.length;
  const addAssets = (assets) => {
    const next = (assets || []).filter((a) => a?.base64).map((a) => `data:image/jpeg;base64,${a.base64}`);
    if (next.length) setImages((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
  };
  async function pickFromLibrary() {
    if (remaining() <= 0) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError("Allow photo access to add pictures.");
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.5,
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: remaining(),
    });
    if (!result.canceled) addAssets(result.assets);
  }
  async function takePhoto() {
    if (remaining() <= 0) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Allow camera access to take a photo.");
    const result = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, allowsEditing: true });
    if (!result.canceled) addAssets(result.assets);
  }

  const canPost = !!bodyText.trim() || images.length > 0;

  async function publish() {
    if (!canPost || posting) return;
    setPosting(true);
    setError("");
    try {
      await api.createNeighborhoodPost({ body: bodyText, images, kind, visibility, pollOptions });
      setBodyText("");
      setImages([]);
      setPollOptions("");
      setKind("post");
      await loadFeed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not post.");
    } finally {
      setPosting(false);
    }
  }

  const composer = (
    <View style={styles.composer}>
      <View style={styles.composerTop}>
        <Avatar name={user?.name} size={42} />
        <AppTextInput
          value={bodyText}
          onChangeText={setBodyText}
          placeholder="What's happening around you?"
          placeholderTextColor="#94A3AB"
          multiline
          style={styles.input}
        />
      </View>
      {kind === "poll" && (
        <AppTextInput value={pollOptions} onChangeText={setPollOptions} placeholder="Poll choices — one per line (2–4)" multiline style={styles.subInput} />
      )}
      {(images.length > 0 || true) && (
        <View style={styles.photoStrip}>
          {images.map((uri, i) => (
            <View key={i} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} />
              <TouchableOpacity style={styles.thumbRemove} onPress={() => setImages((im) => im.filter((_, idx) => idx !== i))}>
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {images.length < MAX_PHOTOS && (
            <>
              <TouchableOpacity style={styles.addTile} onPress={pickFromLibrary}>
                <Ionicons name="images-outline" size={20} color="#0B6E8F" />
                <Text style={styles.addTileText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addTile} onPress={takePhoto}>
                <Ionicons name="camera-outline" size={20} color="#0B6E8F" />
                <Text style={styles.addTileText}>Camera</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      <View style={styles.kindRow}>
        {KINDS.map((k) => {
          const on = kind === k.id;
          return (
            <TouchableOpacity key={k.id} style={[styles.kindChip, on && styles.kindChipOn]} onPress={() => setKind(k.id)}>
              <Ionicons name={k.icon} size={14} color={on ? "#0B6E8F" : "#7A8992"} />
              <Text style={[styles.kindText, on && styles.kindTextOn]}>{k.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.audienceRow}>
        <View style={styles.audienceChips}>
          {AUDIENCE.map((a) => {
            const on = visibility === a.id;
            return (
              <TouchableOpacity key={a.id} style={[styles.audChip, on && styles.audChipOn]} onPress={() => setVisibility(a.id)}>
                <Ionicons name={a.icon} size={13} color={on ? "#fff" : "#5B6B73"} />
                <Text style={[styles.audText, on && styles.audTextOn]}>{a.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[styles.postBtn, (!canPost || posting) && styles.postBtnOff]}
          onPress={publish}
          disabled={!canPost || posting}
        >
          <Text style={styles.postBtnText}>{posting ? "Posting…" : "Post"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        icon="chatbubbles"
        title="Neighborhood"
        subtitle="Your area, beyond the boundary wall"
        onBack={() => navigation.goBack()}
      />
      <View style={styles.tabs}>
        {[{ id: "feed", label: "Feed", icon: "newspaper-outline" }, { id: "people", label: "People", icon: "people-outline" }].map((t) => {
          const on = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => {
                setTab(t.id);
                if (t.id === "people") loadPeople().catch(() => {});
              }}
            >
              <Ionicons name={t.icon} size={16} color={on ? "#0B6E8F" : "#7A8992"} />
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}

      {tab === "feed" ? (
        <ScrollView contentContainerStyle={styles.feed} keyboardShouldPersistTaps="handled">
          {composer}
          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color="#0B6E8F" />
          ) : posts.length ? (
            posts.map((post) => (
              <NeighborhoodPostCard key={post.id} post={post} currentUserId={user?.id} onOpenProfile={openProfile} />
            ))
          ) : (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color="#B7C4CB" />
              <Text style={styles.emptyTitle}>Start the conversation</Text>
              <Text style={styles.emptyText}>Share an update, raise a local problem, or run a poll for your area.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.peopleWrap} keyboardShouldPersistTaps="handled">
          {requests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Follow requests</Text>
              {requests.map((r) => (
                <View key={r.id} style={styles.personRow}>
                  <TouchableOpacity onPress={() => openProfile(r.userId, r.name)}>
                    <Avatar name={r.name} size={44} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.personMeta} onPress={() => openProfile(r.userId, r.name)}>
                    <Text style={styles.personName} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.personSub} numberOfLines={1}>{r.societyName || "Society"} · wants to follow you</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.pill, styles.pillSolid]} onPress={() => api.acceptFollow(r.id).then(() => loadPeople())}>
                    <Text style={[styles.pillLabel, { color: "#fff" }]}>Accept</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color="#8895A0" />
            <AppTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search residents by name"
              onSubmitEditing={() => loadPeople(query)}
              returnKeyType="search"
              style={styles.searchInput}
            />
          </View>
          {people.map((person) => (
            <TouchableOpacity key={person.id} style={styles.personRow} activeOpacity={0.7} onPress={() => openProfile(person.id, person.name)}>
              <Avatar name={person.name} size={44} />
              <View style={styles.personMeta}>
                <Text style={styles.personName} numberOfLines={1}>{person.name}</Text>
                <Text style={styles.personSub} numberOfLines={1}>{person.societyName || "Society"}</Text>
              </View>
              <FollowPill person={person} onChange={loadPeople} />
            </TouchableOpacity>
          ))}
          {people.length === 0 && (
            <Text style={styles.hint}>Search for a resident to follow. Once they accept, you can message each other.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#EEF2F4" },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#fff", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E4EAED" },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#F0F4F6" },
  tabOn: { backgroundColor: "#DDF0F5" },
  tabText: { ...body(600), color: "#7A8992", fontSize: 13 },
  tabTextOn: { color: "#0B6E8F" },
  error: { color: "#B42318", paddingHorizontal: 16, paddingTop: 8, ...body(500) },

  feed: { paddingBottom: 40 },
  composer: { backgroundColor: "#fff", padding: 14, borderBottomWidth: 6, borderBottomColor: "#EEF2F4" },
  composerTop: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  input: { flex: 1, minHeight: 46, maxHeight: 140, ...body(400), fontSize: 16, color: "#182830", paddingTop: 10 },
  subInput: { backgroundColor: "#F4F7F8", borderRadius: 12, padding: 12, marginTop: 10, ...body(400), minHeight: 44 },
  photoStrip: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  thumbWrap: { width: 64, height: 64, borderRadius: 12, overflow: "hidden" },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: "#E7F3F8" },
  thumbRemove: { position: "absolute", top: 3, right: 3, backgroundColor: "rgba(0,0,0,0.55)", width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  addTile: { width: 64, height: 64, borderRadius: 12, backgroundColor: "#EAF4F8", borderWidth: 1, borderColor: "#CDE6EF", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
  addTileText: { ...body(600), color: "#0B6E8F", fontSize: 11 },
  kindRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  kindChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#F4F7F8", borderWidth: 1, borderColor: "#E4EAED" },
  iconOnly: { paddingHorizontal: 10 },
  kindChipOn: { backgroundColor: "#E3F1F6", borderColor: "#BEDFEA" },
  kindText: { ...body(600), color: "#7A8992", fontSize: 12 },
  kindTextOn: { color: "#0B6E8F" },
  audienceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12, flexWrap: "wrap" },
  audienceChips: { flexDirection: "row", gap: 6, flexShrink: 1, flexWrap: "wrap" },
  audChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "#F0F4F6" },
  audChipOn: { backgroundColor: "#0B6E8F" },
  audText: { ...body(600), color: "#5B6B73", fontSize: 12 },
  audTextOn: { color: "#fff" },
  postBtn: { backgroundColor: "#0F6E56", borderRadius: 999, paddingHorizontal: 22, paddingVertical: 9 },
  postBtnOff: { backgroundColor: "#AFC9C0" },
  postBtnText: { color: "#fff", ...body(700), fontSize: 14 },

  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { ...body(700), color: "#33474F", fontSize: 16 },
  emptyText: { ...body(400), color: "#8895A0", fontSize: 13, textAlign: "center" },

  peopleWrap: { padding: 16, gap: 4, paddingBottom: 40 },
  section: { marginBottom: 8 },
  sectionTitle: { ...body(700), color: "#33474F", fontSize: 13, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 8 },
  personMeta: { flex: 1, minWidth: 0 },
  personName: { ...body(700), color: "#0F1F26", fontSize: 15 },
  personSub: { ...body(400), color: "#6B7B84", fontSize: 13, marginTop: 1 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, paddingVertical: 11, ...body(400), fontSize: 15 },
  hint: { ...body(400), color: "#8895A0", fontSize: 13, textAlign: "center", paddingHorizontal: 20, paddingTop: 10 },

  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  pillSolid: { backgroundColor: "#0B6E8F" },
  pillGhost: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D4DDE1" },
  pillLabel: { ...body(700), fontSize: 13, color: "#33474F" },
});
