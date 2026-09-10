import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { isPreschool } from "../lib/org";
import { brand } from "../lib/brand";
import ScreenHeader from "../components/ScreenHeader";
import { resolveAssistant, looksLikeAiFailure } from "../lib/assistant";

// Org-aware starter questions so preschools never see "flat/society/maintenance".
function suggestionsFor(role, preschool) {
  if (preschool) {
    return {
      resident: ["How much fees do I owe?", "Who has visited today?", `How do I use ${brand.name}?`],
      guard: ["Who is waiting for approval at the gate?", "What are today's gate entries?", "How do I log a new visitor?"],
      admin: ["How much fees is still pending?", "Which students have unpaid fees?", "How much did we collect this month?"],
    }[role] || [];
  }
  return {
    resident: ["How much maintenance do I owe?", "Who has visited my flat recently?", `How do I use ${brand.name}?`],
    guard: ["Who is waiting for approval at the gate?", "What are today's gate entries?", "How do I log a new visitor?"],
    admin: ["How much did we collect this month?", "Which flats have unpaid dues?", "How do I import members from a spreadsheet?"],
  }[role] || [];
}

export default function AssistantScreen() {
  const { user } = useAuth();
  const preschool = isPreschool(user);
  const place = preschool ? "school" : "society";
  const [messages, setMessages] = useState([
    { role: "assistant", text: `Hi ${user.name.split(" ")[0]}! Ask me anything about your ${place}.` },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef();
  // Offset the keyboard-avoider by the bottom tab bar height so the input isn't
  // hidden behind the keyboard (this screen always lives inside the tab navigator).
  const tabBarHeight = useBottomTabBarHeight();

  const ask = async (q) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const local = await resolveAssistant(question, user);
      let text = local.reply;
      if (!local.preferLocal) {
        const remote = await api.aiAssistant(question);
        if (remote?.answer && !looksLikeAiFailure(remote.answer)) {
          text = remote.answer;
        }
      }
      setMessages((m) => [...m, { role: "assistant", text }]);
    } catch (e) {
      const local = await resolveAssistant(question, user);
      setMessages((m) => [...m, { role: "assistant", text: local.reply }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const suggestions = suggestionsFor(user.role, preschool);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={tabBarHeight}
    >
      <ScreenHeader icon="sparkles" title="Assistant" subtitle={`Ask anything about your ${place}`} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, maxWidth: 680, width: "100%", alignSelf: "center", flexGrow: 1 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m, i) => (
          <View
            key={i}
            style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble, m.error && styles.errorBubble]}
          >
            <Text style={[styles.bubbleText, m.role === "user" && styles.userText]}>{m.text}</Text>
          </View>
        ))}
        {busy && (
          <View style={[styles.bubble, styles.aiBubble]}>
            <ActivityIndicator color="#0B6E8F" />
          </View>
        )}

        {messages.length <= 1 && (
          <View style={styles.suggestions}>
            {suggestions.map((s) => (
              <TouchableOpacity key={s} style={styles.suggestion} onPress={() => ask(s)}>
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.inputBarWrap}>
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about visitors, dues, balance..."
          onSubmitEditing={() => ask()}
          returnKeyType="send"
        />
        <TouchableOpacity style={[styles.sendBtn, busy && { opacity: 0.5 }]} onPress={() => ask()} disabled={busy}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8FA" },
  bubble: { maxWidth: "78%", borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 8 },
  aiBubble: { backgroundColor: "#fff", alignSelf: "flex-start", borderWidth: 1, borderColor: "#E6EEF2" },
  userBubble: { backgroundColor: "#0B6E8F", alignSelf: "flex-end" },
  errorBubble: { backgroundColor: "#FBE7E4" },
  bubbleText: { color: "#1B2B33", fontSize: 14, lineHeight: 20 },
  userText: { color: "#fff" },
  suggestions: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestion: { backgroundColor: "#E7F1F5", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  suggestionText: { color: "#0B6E8F", fontWeight: "600", fontSize: 12.5 },
  inputBarWrap: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E6EDF0" },
  inputBar: { flexDirection: "row", padding: 10, gap: 8, maxWidth: 680, width: "100%", alignSelf: "center" },
  input: { flex: 1, borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, backgroundColor: "#F8FAFB" },
  sendBtn: { backgroundColor: "#0B6E8F", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
