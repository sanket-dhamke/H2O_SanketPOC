import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "./Avatar";
import { body } from "../lib/type";
import { timeAgo, titleCase, VISIBILITY_META, KIND_META } from "../lib/social";
import { api } from "../lib/api";

// One post rendered in the familiar social-feed shape: avatar, name + secondary
// line + relative time, audience/kind pills, body, optional photo, an inline
// poll with result bars, and a like/reply/share action row. The author (avatar
// and name) is tappable to open their profile.
export default function NeighborhoodPostCard({ post, currentUserId, onOpenProfile }) {
  const [liked, setLiked] = useState(!!post.liked);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [poll, setPoll] = useState(post.poll || []);
  const [myVote, setMyVote] = useState(post.myVote || null);

  const vis = VISIBILITY_META[post.visibility] || { label: post.visibility, icon: "ellipse-outline" };
  const kind = KIND_META[post.kind];
  const isSelf = post.authorId === currentUserId;
  const images = post.images && post.images.length ? post.images : post.imageUrl ? [post.imageUrl] : [];
  const totalVotes = poll.reduce((sum, choice) => sum + choice.votes, 0);

  const openProfile = () => { if (!isSelf) onOpenProfile?.(post.authorId, post.authorName); };

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const res = await api.likeNeighborhood(post.id);
      setLiked(res.liked);
      setLikeCount(res.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount((n) => Math.max(0, n + (next ? -1 : 1)));
    }
  }

  async function vote(option) {
    const prevVote = myVote;
    const optimistic = poll.map((c) => {
      let votes = c.votes;
      if (c.option === option) votes += prevVote === option ? 0 : 1;
      if (c.option === prevVote && prevVote !== option) votes -= 1;
      return { ...c, votes };
    });
    setPoll(optimistic);
    setMyVote(option);
    try {
      await api.voteNeighborhood(post.id, option);
    } catch {
      setPoll(post.poll || []);
      setMyVote(prevVote);
    }
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={openProfile} activeOpacity={isSelf ? 1 : 0.7}>
        <Avatar name={post.authorName} size={46} />
      </TouchableOpacity>
      <View style={styles.main}>
        <View style={styles.headerLine}>
          <TouchableOpacity style={styles.identity} onPress={openProfile} activeOpacity={isSelf ? 1 : 0.7}>
            <Text style={styles.name} numberOfLines={1}>{post.authorName}</Text>
            <Text style={styles.handle} numberOfLines={1}>
              {"  "}{post.societyName || "Society"}{post.createdAt ? ` · ${timeAgo(post.createdAt)}` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pills}>
          {kind && post.kind !== "post" && (
            <View style={[styles.pill, { backgroundColor: `${kind.color}14` }]}>
              <Ionicons name={kind.icon} size={12} color={kind.color} />
              <Text style={[styles.pillText, { color: kind.color }]}>{kind.label}</Text>
            </View>
          )}
          <View style={styles.pill}>
            <Ionicons name={vis.icon} size={12} color="#5B6B73" />
            <Text style={styles.pillText}>
              {vis.label}{post.visibility === "area" && post.area ? ` · ${titleCase(post.area)}` : ""}
            </Text>
          </View>
        </View>

        {!!post.body && <Text style={styles.copy}>{post.body}</Text>}
        {images.length === 1 && <Image source={{ uri: images[0] }} style={styles.photoSingle} resizeMode="cover" />}
        {images.length > 1 && (
          <View style={styles.grid}>
            {images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={[styles.gridImg, images.length === 3 && i === 0 && styles.gridWide]} resizeMode="cover" />
            ))}
          </View>
        )}

        {poll.length > 0 && (
          <View style={styles.poll}>
            {poll.map((choice) => {
              const pct = totalVotes ? Math.round((choice.votes / totalVotes) * 100) : 0;
              const mine = myVote === choice.option;
              return (
                <TouchableOpacity key={choice.option} style={styles.choice} activeOpacity={0.85} onPress={() => vote(choice.option)}>
                  <View style={[styles.choiceFill, { width: `${pct}%`, backgroundColor: mine ? "#CBEFE1" : "#EDF2F4" }]} />
                  <View style={styles.choiceRow}>
                    <Text style={[styles.choiceLabel, mine && styles.choiceLabelMine]} numberOfLines={1}>
                      {mine ? "✓ " : ""}{choice.option}
                    </Text>
                    <Text style={styles.choicePct}>{pct}%</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.pollMeta}>
              {totalVotes} vote{totalVotes === 1 ? "" : "s"}{myVote ? " · you voted" : " · tap a choice to vote"}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.action} onPress={toggleLike} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={liked ? "heart" : "heart-outline"} size={18} color={liked ? "#E0245E" : "#8895A0"} />
            {likeCount > 0 && <Text style={[styles.actionCount, liked && { color: "#E0245E" }]}>{likeCount}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={openProfile} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="person-circle-outline" size={18} color="#8895A0" />
            {!isSelf && <Text style={styles.actionText}>Profile</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: 12, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E4EAED" },
  main: { flex: 1, minWidth: 0 },
  headerLine: { flexDirection: "row", alignItems: "center" },
  identity: { flexDirection: "row", alignItems: "baseline", flex: 1, minWidth: 0 },
  name: { ...body(700), color: "#0F1F26", fontSize: 15 },
  handle: { ...body(400), color: "#6B7B84", fontSize: 13, flexShrink: 1 },
  pills: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F0F4F6", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { ...body(600), fontSize: 11, color: "#5B6B73" },
  copy: { ...body(400), color: "#182830", fontSize: 15, lineHeight: 21, marginTop: 6 },
  photoSingle: { width: "100%", height: 200, borderRadius: 14, marginTop: 10, backgroundColor: "#EDF2F4" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 10, borderRadius: 14, overflow: "hidden" },
  gridImg: { width: "49%", aspectRatio: 1, backgroundColor: "#EDF2F4" },
  gridWide: { width: "100%", aspectRatio: 2 },
  poll: { marginTop: 10, gap: 8 },
  choice: { height: 38, borderRadius: 10, backgroundColor: "#F5F8F9", justifyContent: "center", overflow: "hidden" },
  choiceFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 10 },
  choiceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  choiceLabel: { ...body(600), color: "#223", fontSize: 14, flex: 1 },
  choiceLabelMine: { ...body(700), color: "#0F6E56" },
  choicePct: { ...body(700), color: "#33474F", fontSize: 13 },
  pollMeta: { ...body(400), color: "#8895A0", fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", gap: 22, marginTop: 12 },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: { ...body(600), color: "#8895A0", fontSize: 13 },
  actionText: { ...body(600), color: "#8895A0", fontSize: 13 },
});
