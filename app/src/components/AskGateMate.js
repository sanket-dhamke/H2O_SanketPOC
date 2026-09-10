import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import TextInput from "./AppTextInput";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { labelsFor, isPreschool } from "../lib/org";
import { body, head } from "../lib/type";
import { resolveAssistant, looksLikeAiFailure } from "../lib/assistant";
import { openScreen } from "../lib/nav";
import { brand } from "../lib/brand";

// Voice recording is native-only; the browser build falls back to typing.
const VOICE_SUPPORTED = Platform.OS !== "web";

function prompt(sentence) {
  return { label: sentence, q: sentence };
}

function promptsFor(role, L, preschool) {
  if (role === "admin") {
    return preschool
      ? [
          prompt("How much fees is still pending?"),
          prompt("Which students have unpaid fees?"),
          prompt("How do I add students from a spreadsheet?"),
        ]
      : [
          prompt("How much did we collect this month?"),
          prompt(`Which ${L.units.toLowerCase()} have unpaid dues?`),
          prompt("How do I import members from a spreadsheet?"),
        ];
  }
  if (role === "guard") {
    return [
      prompt("How do I log a new visitor?"),
      prompt("Who is waiting for approval at the gate?"),
      prompt("What are today's gate entries?"),
    ];
  }
  return preschool
    ? [
        prompt("How much fees do I owe?"),
        prompt("Who has visited today?"),
        prompt(`How do I use ${brand.name}?`),
      ]
    : [
        prompt(`How much ${L.fees.toLowerCase()} do I owe?`),
        prompt(`Who has visited my ${L.unit.toLowerCase()} recently?`),
        prompt(`How do I use ${brand.name}?`),
      ];
}

// White dashboard card — same shell as the summary charts, so it sits in the
// page flow instead of punching a teal block over the hero photo.
export default function AskGateMate({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const preschool = isPreschool(user);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const prompts = promptsFor(user.role, L, preschool);

  const ask = async (text) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    try {
      // Always solve from the app's own data first. The live Groq model on
      // Render is retired, so waiting on /api/ai/* just surfaces a 502.
      const local = await resolveAssistant(question, user);
      setResult({ question, reply: local.reply, action: local.action });
      // Live bills/visitors/help always win. Remote chat is optional colour.
      if (!local.preferLocal) {
        const remote = await api.aiAssistant(question);
        const text = remote?.answer || remote?.reply;
        if (text && !looksLikeAiFailure(text)) {
          setResult({
            question,
            reply: text,
            action: remote.action || local.action,
          });
        }
      }
    } catch {
      const local = await resolveAssistant(question, user);
      setResult({ question, reply: local.reply, action: local.action });
    } finally {
      setBusy(false);
    }
  };

  const startListening = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone needed", "Allow microphone access to speak your request.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setListening(true);
    } catch (e) {
      Alert.alert("Could not start recording", e.message);
    }
  };

  const stopListening = async () => {
    setListening(false);
    setBusy(true);
    try {
      await recorder.stop();
      const base64 = await FileSystem.readAsStringAsync(recorder.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { text } = await api.aiTranscribe(`data:audio/m4a;base64,${base64}`);
      setBusy(false);
      if (!text?.trim()) {
        Alert.alert("Didn't catch that", "Please try again, or type your request.");
        return;
      }
      await ask(text);
    } catch (e) {
      setBusy(false);
      const msg = /404/.test(e.message || "")
        ? "Voice is not available on the live server yet. Type your question instead."
        : e.message;
      Alert.alert("Voice input failed", msg);
    }
  };

  const runAction = (action) => {
    if (!action?.route) return;
    setResult(null);
    openScreen(navigation, action.route, action.params || undefined);
  };

  return (
    <View style={styles.shell}>
      <View style={styles.accent} />
      <View style={styles.card}>
        <View style={styles.headRow}>
          <View style={styles.mark}>
            <Ionicons name="sparkles" size={14} color="#0B6E8F" />
          </View>
          <Text style={styles.title}>{brand.ask}</Text>
          <View style={styles.aiPill}>
            <Text style={styles.aiPillText}>AI</Text>
          </View>
        </View>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={
              listening
                ? "Listening to your question"
                : preschool
                  ? "Type a question about fees, visitors, or hall bookings"
                  : "Type a question about bills, visitors, or bookings"
            }
            placeholderTextColor="#7A93A0"
            onSubmitEditing={() => ask()}
            returnKeyType="send"
            blurOnSubmit
            multiline
            textAlignVertical="top"
            editable={!listening}
          />
          <View style={styles.composerActions}>
            {VOICE_SUPPORTED ? (
              <TouchableOpacity
                style={[styles.iconBtn, listening && styles.micBtnActive]}
                onPress={listening ? stopListening : startListening}
                disabled={busy && !listening}
                accessibilityLabel={listening ? "Stop recording" : "Speak your request"}
              >
                <Ionicons name={listening ? "stop" : "mic"} size={16} color={listening ? "#B42318" : "#0B6E8F"} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.sendBtn, (busy || listening) && { opacity: 0.5 }]}
              onPress={() => ask()}
              disabled={busy || listening}
              accessibilityLabel="Send request"
            >
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {result ? (
          <View style={styles.answer}>
            <Text style={styles.question}>
              {result.question}
            </Text>
            {busy || result.reply == null ? (
              <View style={styles.thinking}>
                <ActivityIndicator color="#0B6E8F" size="small" />
                <Text style={styles.thinkingText}>Looking up your {L.org.toLowerCase()} data…</Text>
              </View>
            ) : (
              <Text style={[styles.reply, result.error && styles.replyError]}>
                {result.reply}
              </Text>
            )}
            <View style={styles.answerActions}>
              {result.action?.route ? (
                <TouchableOpacity style={styles.actionBtn} onPress={() => runAction(result.action)}>
                  <Text style={styles.actionBtnText}>{result.action.label}</Text>
                  <Ionicons name="arrow-forward" size={13} color="#fff" />
                </TouchableOpacity>
              ) : null}
              {!busy && result.reply != null ? (
                <TouchableOpacity style={styles.clearBtn} onPress={() => setResult(null)}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.chips}>
            {prompts.map((p) => (
              <TouchableOpacity key={p.q} style={styles.chip} onPress={() => ask(p.q)} disabled={busy}>
                <Text style={styles.chipText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#E6EEF2",
    backgroundColor: "#fff",
    shadowColor: "#0B3A49",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  accent: { width: 4, backgroundColor: "#0B6E8F" },
  card: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: "#fff" },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#EAF4F8",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#0B3A49", fontSize: 13.5, ...head(700) },
  aiPill: {
    backgroundColor: "#0B6E8F",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  aiPillText: { color: "#fff", fontSize: 9, letterSpacing: 0.6, ...head(700) },
  input: {
    width: "100%",
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: "#F7FBFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D5E6ED",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    lineHeight: 21,
    color: "#1B2B33",
    ...body(400),
  },
  composer: { gap: 8 },
  composerActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnActive: { backgroundColor: "#FBE7E4" },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0B6E8F",
    alignItems: "center",
    justifyContent: "center",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: {
    backgroundColor: "#F3F8FA",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E6EEF2",
    maxWidth: "100%",
  },
  chipText: { color: "#0B6E8F", ...body(600), fontSize: 12, lineHeight: 16 },
  answer: {
    marginTop: 10,
    marginLeft: 0,
    backgroundColor: "#F5F9FB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E6EEF2",
    gap: 6,
  },
  question: { color: "#7A93A0", fontSize: 11.5, ...body(600) },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8 },
  thinkingText: { color: "#6B7B85", fontSize: 12.5, ...body(400) },
  reply: { color: "#1B2B33", fontSize: 13.5, lineHeight: 19, ...body(400) },
  replyError: { color: "#B42318" },
  answerActions: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0B6E8F",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnText: { color: "#fff", ...body(700), fontSize: 12.5 },
  clearBtn: { paddingVertical: 6 },
  clearBtnText: { color: "#6B7B85", ...body(600), fontSize: 12.5 },
});
