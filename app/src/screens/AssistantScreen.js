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
import ScreenHeader from "../components/ScreenHeader";

// Org-aware starter questions so preschools never see "flat/society/maintenance".
function suggestionsFor(role, preschool) {
  if (preschool) {
    return {
      resident: ["Who visited in the last week?", "How much fees do I owe?", "Show recent entries"],
      guard: ["Who is pending approval?", "List today's visitors", "Any vehicles logged today?"],
      admin: ["What are the total pending fees?", "Which students have dues?", "How much did we collect this month?"],
    }[role] || [];
  }
  return {
    resident: ["Who visited my flat in the last week?", "How much maintenance do I owe?", "Show my recent deliveries"],
    guard: ["Who is currently pending approval?", "List today's visitors", "Any vehicles logged today?"],
    admin: ["What is the society balance?", "Which flats have dues?", "How much did we collect this month?"],
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
      const { answer } = await api.aiAssistant(question);
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${e.message}`, error: true }]);
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
        contentContainerStyle={{ padding: 16 }}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  bubble: { maxWidth: "85%", borderRadius: 14, padding: 12, marginBottom: 10 },
  aiBubble: { backgroundColor: "#fff", alignSelf: "flex-start", borderTopLeftRadius: 4 },
  userBubble: { backgroundColor: "#0B6E8F", alignSelf: "flex-end", borderTopRightRadius: 4 },
  errorBubble: { backgroundColor: "#FBE7E4" },
  bubbleText: { color: "#1B2B33", fontSize: 15, lineHeight: 21 },
  userText: { color: "#fff" },
  suggestions: { marginTop: 10, gap: 8 },
  suggestion: { backgroundColor: "#E7F1F5", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, alignSelf: "flex-start" },
  suggestionText: { color: "#0B6E8F", fontWeight: "600", fontSize: 13 },
  inputBar: { flexDirection: "row", padding: 12, gap: 10, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E6EDF0" },
  input: { flex: 1, borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, backgroundColor: "#F8FAFB" },
  sendBtn: { backgroundColor: "#0B6E8F", borderRadius: 22, paddingHorizontal: 20, justifyContent: "center" },
  sendText: { color: "#fff", fontWeight: "700" },
});
