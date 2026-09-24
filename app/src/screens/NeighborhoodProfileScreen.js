import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "../components/ScreenHeader";
import AppTextInput from "../components/AppTextInput";
import Avatar from "../components/Avatar";
import NeighborhoodPostCard from "../components/NeighborhoodPostCard";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { body } from "../lib/type";
import { titleCase } from "../lib/social";

export default function NeighborhoodProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { userId, name } = route.params || {};

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("posts");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.neighborhoodProfile(userId);
      setProfile(data.profile);
      setPosts(data.posts || []);
      setError("");
    } catch (e) {
      setError(e.message || "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function act() {
    if (!profile || busy) return;
    setBusy(true);
    try {
      if (profile.follow === "none") await api.requestFollow(userId);
      else if (profile.follow === "incoming") await api.acceptFollow(profile.followId);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function openChat() {
    try {
      const data = await api.neighborhoodMessages(userId);
      setMessages(data.messages || []);
      setTab("chat");
    } catch (e) {
      setError(e.message || "You can message after the follow is accepted.");
    }
  }

  async function send() {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    try {
      await api.sendNeighborhoodMessage(userId, text);
      const data = await api.neighborhoodMessages(userId);
      setMessages(data.messages || []);
    } catch (e) {
      setError(e.message || "Could not send.");
    }
  }

  const displayName = profile?.name || name || "Resident";
  const subtitle = profile
    ? [profile.societyName, profile.areaLabel].filter(Boolean).join(" · ")
    : "";

  const followLabel = profile?.follow === "accepted" ? "Following"
    : profile?.follow === "requested" ? "Requested"
    : profile?.follow === "incoming" ? "Accept request"
    : "Follow";
  const followSolid = profile?.follow === "none" || profile?.follow === "incoming";

  return (
    <View style={styles.screen}>
      <ScreenHeader icon="person-circle" title={displayName} subtitle={subtitle} onBack={() => navigation.goBack()} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#0B6E8F" />
      ) : !profile ? (
        <Text style={styles.error}>{error || "Profile not found."}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.identityRow}>
              <Avatar name={displayName} size={68} />
              <View style={styles.metaCol}>
                <Text style={styles.name}>{displayName}</Text>
                {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}
                <View style={styles.stats}>
                  <Text style={styles.stat}><Text style={styles.statNum}>{profile.postCount}</Text> posts</Text>
                  {profile.area && (
                    <View style={styles.areaTag}>
                      <Ionicons name="location" size={12} color="#0B6E8F" />
                      <Text style={styles.areaText}>{titleCase(profile.area)} area</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {!profile.isSelf && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.btn, followSolid ? styles.btnSolid : styles.btnGhost, profile.follow === "requested" && styles.btnDisabled]}
                  onPress={act}
                  disabled={busy || profile.follow === "requested" || profile.follow === "accepted"}
                >
                  {profile.follow === "accepted" && <Ionicons name="checkmark" size={16} color="#0F6E56" />}
                  <Text style={[styles.btnText, followSolid && { color: "#fff" }, profile.follow === "accepted" && { color: "#0F6E56" }]}>{followLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, profile.canMessage ? styles.btnOutline : styles.btnMuted]}
                  onPress={profile.canMessage ? openChat : undefined}
                  disabled={!profile.canMessage}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={profile.canMessage ? "#0B6E8F" : "#A9B6BC"} />
                  <Text style={[styles.btnText, { color: profile.canMessage ? "#0B6E8F" : "#A9B6BC" }]}>Message</Text>
                </TouchableOpacity>
              </View>
            )}
            {!profile.isSelf && !profile.canMessage && (
              <Text style={styles.gateHint}>
                <Ionicons name="lock-closed" size={11} color="#8895A0" /> Messaging opens once {displayName.split(" ")[0]} accepts your follow.
              </Text>
            )}
          </View>

          {profile.canMessage && (
            <View style={styles.subTabs}>
              {[{ id: "posts", label: "Posts" }, { id: "chat", label: "Messages" }].map((t) => {
                const on = tab === t.id;
                return (
                  <TouchableOpacity key={t.id} style={[styles.subTab, on && styles.subTabOn]} onPress={() => (t.id === "chat" ? openChat() : setTab("posts"))}>
                    <Text style={[styles.subTabText, on && styles.subTabTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          {tab === "chat" && profile.canMessage ? (
            <View style={styles.chat}>
              {messages.length === 0 && <Text style={styles.hint}>No messages yet. Say hello.</Text>}
              {messages.map((m) => {
                const mine = m.fromId === user?.id;
                return (
                  <View key={m.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine && { color: "#fff" }]}>{m.body}</Text>
                  </View>
                );
              })}
              <View style={styles.composerRow}>
                <AppTextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" style={styles.msgInput} onSubmitEditing={send} returnKeyType="send" />
                <TouchableOpacity style={styles.sendBtn} onPress={send}>
                  <Ionicons name="send" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.postsWrap}>
              <Text style={styles.postsHeading}>Posts</Text>
              {posts.length ? (
                posts.map((post) => (
                  <NeighborhoodPostCard
                    key={post.id}
                    post={post}
                    currentUserId={user?.id}
                    onOpenProfile={(id, nm) => navigation.push("NeighborhoodProfile", { userId: id, name: nm })}
                  />
                ))
              ) : (
                <View style={styles.empty}>
                  <Ionicons name="documents-outline" size={34} color="#B7C4CB" />
                  <Text style={styles.emptyText}>
                    {profile.isSelf ? "You haven't posted yet." : `No posts from ${displayName.split(" ")[0]} that you can see yet.`}
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#EEF2F4" },
  scroll: { paddingBottom: 40 },
  card: { backgroundColor: "#fff", margin: 12, borderRadius: 18, padding: 16, gap: 14 },
  identityRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  metaCol: { flex: 1, minWidth: 0 },
  name: { ...body(800), color: "#0F1F26", fontSize: 20 },
  sub: { ...body(400), color: "#6B7B84", fontSize: 14, marginTop: 2 },
  stats: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  stat: { ...body(400), color: "#6B7B84", fontSize: 13 },
  statNum: { ...body(800), color: "#0F1F26" },
  areaTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E3F1F6", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  areaText: { ...body(600), color: "#0B6E8F", fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 999 },
  btnSolid: { backgroundColor: "#0B6E8F" },
  btnGhost: { backgroundColor: "#EAF4F1", borderWidth: 1, borderColor: "#BFE3D7" },
  btnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#BEDFEA" },
  btnMuted: { backgroundColor: "#F0F4F6" },
  btnDisabled: { opacity: 0.9 },
  btnText: { ...body(700), fontSize: 14, color: "#33474F" },
  gateHint: { ...body(400), color: "#8895A0", fontSize: 12 },

  subTabs: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginBottom: 4 },
  subTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: "#fff" },
  subTabOn: { backgroundColor: "#DDF0F5" },
  subTabText: { ...body(600), color: "#7A8992", fontSize: 13 },
  subTabTextOn: { color: "#0B6E8F" },

  postsWrap: { backgroundColor: "#fff", marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E4EAED" },
  postsHeading: { ...body(700), color: "#33474F", fontSize: 13, paddingHorizontal: 16, paddingTop: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { alignItems: "center", padding: 36, gap: 8 },
  emptyText: { ...body(400), color: "#8895A0", fontSize: 13, textAlign: "center" },

  chat: { backgroundColor: "#fff", marginHorizontal: 12, borderRadius: 16, padding: 12, gap: 8 },
  hint: { ...body(400), color: "#8895A0", fontSize: 13, textAlign: "center", paddingVertical: 12 },
  bubble: { maxWidth: "80%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: "#0B6E8F", alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "#EEF2F4", alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleText: { ...body(400), color: "#182830", fontSize: 15 },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  msgInput: { flex: 1, backgroundColor: "#F4F7F8", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, ...body(400), fontSize: 15 },
  sendBtn: { backgroundColor: "#0B6E8F", width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  error: { color: "#B42318", paddingHorizontal: 16, paddingVertical: 8, ...body(500) },
});
