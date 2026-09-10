import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import TextInput from "../components/AppTextInput";
import { helpTopicsFor } from "../lib/helpGuide";
import { useAuth } from "../lib/auth";
import { isPreschool } from "../lib/org";
import { body, head } from "../lib/type";
import { brand } from "../lib/brand";

export default function HelpScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState("home");
  const allTopics = useMemo(() => helpTopicsFor(user), [user]);

  const topics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTopics;
    return allTopics.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.includes(q)) ||
        t.examples.some((e) => e.toLowerCase().includes(q))
    );
  }, [query, allTopics]);

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="book"
        title="Help & how-to"
        subtitle="How each feature works, with examples you can ask the Assistant"
        onBack={() => navigation.navigate("CommunityHome")}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color="#8895A0" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={isPreschool(user) ? "Search fees, visitors, hall…" : "Search bills, visitors, clubhouse…"}
          />
        </View>
        <Text style={styles.lead}>
          You can also ask {brand.ask} on Home, or Assistant in Community — they use the same guide.
        </Text>
        {topics.map((t) => {
          const open = openId === t.id;
          return (
            <View key={t.id} style={styles.card}>
              <TouchableOpacity
                style={styles.cardHead}
                onPress={() => setOpenId(open ? null : t.id)}
                activeOpacity={0.85}
              >
                <View style={styles.iconChip}>
                  <Ionicons name={t.icon} size={18} color="#0B6E8F" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{t.title}</Text>
                  <Text style={styles.summary} numberOfLines={open ? 4 : 2}>
                    {t.summary}
                  </Text>
                </View>
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="#8895A0" />
              </TouchableOpacity>
              {open ? (
                <View style={styles.cardBody}>
                  <Text style={styles.section}>How to</Text>
                  {t.steps.map((s, i) => (
                    <View key={i} style={styles.step}>
                      <Text style={styles.stepNum}>{i + 1}</Text>
                      <Text style={styles.stepText}>{s}</Text>
                    </View>
                  ))}
                  <Text style={styles.section}>Ask the Assistant</Text>
                  {t.examples.map((e) => (
                    <View key={e} style={styles.example}>
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0B6E8F" />
                      <Text style={styles.exampleText}>{e}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {topics.length === 0 ? <Text style={styles.empty}>No matching topics. Try “bill” or “visitor”.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  body: { padding: 16, paddingBottom: 40 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E6EEF2",
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15 },
  lead: { fontSize: 13, color: "#6B7B85", marginBottom: 14, lineHeight: 18, ...body(400) },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E6EEF2",
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#EAF4F7",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 15, ...head(800), color: "#1B2B33" },
  summary: { fontSize: 12.5, color: "#6B7B85", marginTop: 2, ...body(400) },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: "#F1F5F7" },
  section: { fontSize: 12, ...head(700), color: "#8895A0", marginTop: 12, marginBottom: 8, textTransform: "uppercase" },
  step: { flexDirection: "row", gap: 10, marginBottom: 8 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EAF4F7",
    color: "#0B6E8F",
    textAlign: "center",
    lineHeight: 20,
    fontSize: 11,
    ...head(700),
  },
  stepText: { flex: 1, fontSize: 13.5, color: "#1B2B33", lineHeight: 19, ...body(400) },
  example: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  exampleText: { color: "#0B6E8F", fontSize: 13, ...body(600) },
  empty: { textAlign: "center", color: "#8895A0", marginTop: 24, ...body(400) },
});
