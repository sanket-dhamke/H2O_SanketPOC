import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "../components/ScreenHeader";
import AppTextInput from "../components/AppTextInput";
import { api, ApiError } from "../lib/api";
import { body } from "../lib/type";

const VISIBILITY = [
  { id: "followers", label: "Followers" },
  { id: "society", label: "My society" },
  { id: "all", label: "Everyone" },
];

export default function NeighborhoodScreen() {
  const navigation = useNavigation();
  const [tab, setTab] = useState("feed");
  const [posts, setPosts] = useState([]);
  const [bodyText, setBodyText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [kind, setKind] = useState("post");
  const [visibility, setVisibility] = useState("society");
  const [pollOptions, setPollOptions] = useState("");
  const [people, setPeople] = useState([]);
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState("");
  const [chatWith, setChatWith] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const loadFeed = useCallback(async () => {
    const data = await api.neighborhoodFeed();
    setPosts(data.posts || []);
  }, []);

  const loadPeople = useCallback(async (q = query) => {
    const [found, incoming] = await Promise.all([api.neighborhoodPeople(q), api.neighborhoodRequests()]);
    setPeople(found.people || []);
    setRequests(incoming.requests || []);
  }, [query]);

  useFocusEffect(useCallback(() => {
    loadFeed().catch((e) => setError(e.message));
  }, [loadFeed]));

  async function publish() {
    setError("");
    try {
      await api.createNeighborhoodPost({ body: bodyText, imageUrl, kind, visibility, pollOptions });
      setBodyText("");
      setImageUrl("");
      setPollOptions("");
      await loadFeed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not post.");
    }
  }

  async function openChat(person) {
    setChatWith(person);
    setTab("chat");
    try {
      const data = await api.neighborhoodMessages(person.id);
      setMessages(data.messages || []);
    } catch (e) {
      Alert.alert("Messages", e.message || "Follow has to be accepted first.");
      setTab("people");
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader icon="chatbubbles" title="Neighborhood" subtitle="Across societies, on this test branch" onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        {["feed", "people"].map((id) => (
          <TouchableOpacity key={id} style={[styles.tab, tab === id && styles.tabOn]} onPress={() => { setTab(id); if (id === "people") loadPeople().catch(() => {}); }}>
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{id === "feed" ? "Feed" : "People"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {tab === "feed" && (
        <ScrollView contentContainerStyle={styles.pad}>
          <AppTextInput value={bodyText} onChangeText={setBodyText} placeholder="Share a problem, idea, or update" multiline style={styles.box} />
          <AppTextInput value={imageUrl} onChangeText={setImageUrl} placeholder="Photo link (optional)" style={styles.box} />
          <View style={styles.row}>
            {["post", "problem", "poll"].map((id) => (
              <TouchableOpacity key={id} style={[styles.chip, kind === id && styles.chipOn]} onPress={() => setKind(id)}>
                <Text style={styles.chipText}>{id}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {kind === "poll" && <AppTextInput value={pollOptions} onChangeText={setPollOptions} placeholder={"One choice per line"} multiline style={styles.box} />}
          <View style={styles.row}>
            {VISIBILITY.map((item) => (
              <TouchableOpacity key={item.id} style={[styles.chip, visibility === item.id && styles.chipOn]} onPress={() => setVisibility(item.id)}>
                <Text style={styles.chipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.postBtn} onPress={publish}><Text style={styles.postBtnText}>Post</Text></TouchableOpacity>
          {posts.map((post) => (
            <View key={post.id} style={styles.card}>
              <Text style={styles.name}>{post.authorName} · {post.societyName || "Society"}</Text>
              <Text style={styles.meta}>{post.kind} · {post.visibility}</Text>
              <Text style={styles.copy}>{post.body}</Text>
              {!!post.imageUrl && <Image source={{ uri: post.imageUrl }} style={styles.photo} />}
              {(post.poll || []).map((choice) => (
                <TouchableOpacity key={choice.option} style={styles.choice} onPress={() => api.voteNeighborhood(post.id, choice.option).then(loadFeed)}>
                  <Text style={body}>{choice.option} · {choice.votes}{post.myVote === choice.option ? " · your vote" : ""}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
      {tab === "people" && (
        <ScrollView contentContainerStyle={styles.pad}>
          <AppTextInput value={query} onChangeText={setQuery} placeholder="Search a resident" onSubmitEditing={() => loadPeople(query)} style={styles.box} />
          {requests.map((req) => (
            <View key={req.id} style={styles.card}>
              <Text style={styles.name}>{req.name} wants to follow you</Text>
              <TouchableOpacity onPress={() => api.acceptFollow(req.id).then(() => loadPeople())}><Text style={styles.link}>Accept</Text></TouchableOpacity>
            </View>
          ))}
          {people.map((person) => (
            <View key={person.id} style={styles.card}>
              <Text style={styles.name}>{person.name}</Text>
              <Text style={styles.meta}>{person.societyName || "Society"} · {person.follow}</Text>
              <View style={styles.row}>
                {person.follow !== "accepted" && (
                  <TouchableOpacity onPress={() => api.requestFollow(person.id).then(() => loadPeople())}><Text style={styles.link}>Follow</Text></TouchableOpacity>
                )}
                {person.follow === "accepted" && (
                  <TouchableOpacity onPress={() => openChat(person)}><Ionicons name="chatbubble-outline" size={18} color="#0B6E8F" /></TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      {tab === "chat" && chatWith && (
        <View style={styles.pad}>
          <Text style={styles.name}>{chatWith.name}</Text>
          {messages.map((msg) => <Text key={msg.id} style={styles.copy}>{msg.body}</Text>)}
          <AppTextInput value={draft} onChangeText={setDraft} placeholder="Message" style={styles.box} />
          <TouchableOpacity style={styles.postBtn} onPress={async () => {
            await api.sendNeighborhoodMessage(chatWith.id, draft);
            setDraft("");
            const data = await api.neighborhoodMessages(chatWith.id);
            setMessages(data.messages || []);
          }}><Text style={styles.postBtnText}>Send</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7F8" },
  tabs: { flexDirection: "row", gap: 8, padding: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#E6EEF0" },
  tabOn: { backgroundColor: "#0B6E8F" },
  tabText: { ...body, color: "#335" },
  tabTextOn: { color: "#fff" },
  pad: { padding: 16, gap: 10, paddingBottom: 40 },
  box: { backgroundColor: "#fff", borderRadius: 12, padding: 12, minHeight: 44 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#fff" },
  chipOn: { backgroundColor: "#D7F3EA" },
  chipText: { ...body },
  postBtn: { backgroundColor: "#0F6E56", borderRadius: 12, padding: 12, alignItems: "center" },
  postBtnText: { color: "#fff", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 12, gap: 4 },
  name: { ...body, fontWeight: "700" },
  meta: { ...body, color: "#667" },
  copy: { ...body, color: "#223" },
  photo: { width: "100%", height: 180, borderRadius: 12, marginTop: 8 },
  choice: { paddingVertical: 8 },
  link: { color: "#0B6E8F", fontWeight: "700" },
  error: { color: "#B42318", paddingHorizontal: 16 },
});
