import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
  ScrollView,
} from "react-native";
import { useAuth } from "../lib/auth";
import { getBaseUrl, setBaseUrl } from "../lib/api";

// Wide skyline on desktop/web (landscape viewport), tall portrait shot on phones.
const BG_IMAGE =
  Platform.OS === "web"
    ? require("../../assets/society-bg-wide.png")
    : require("../../assets/society-bg.png");

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const passwordRef = useRef(null);

  useEffect(() => {
    getBaseUrl().then(setServerUrl);
  }, []);

  const onForgotPassword = () => {
    Alert.alert(
      "Forgot your password?",
      "For security, passwords are reset by an administrator:\n\n" +
        "• Residents & guards: ask your society admin — they can set a new password for you.\n\n" +
        "• Society admins: contact your H2O platform owner (support), who can reset it for you.\n\n" +
        "You can change your password yourself any time after logging in (Home → key icon).",
      [{ text: "Got it" }]
    );
  };

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Please enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await setBaseUrl(serverUrl);
      await login(email.trim(), password);
    } catch (e) {
      Alert.alert("Login failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ImageBackground source={BG_IMAGE} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoWrap}>
            <Text style={styles.logo}>H2O</Text>
            <Text style={styles.tagline}>Your society, simplified</Text>
          </View>

          <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@society.com"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            ref={passwordRef}
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="Enter your password"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
          <TouchableOpacity
            style={styles.showBtn}
            onPress={() => setShowPassword((v) => !v)}
          >
            <Text style={styles.showBtnText}>{showPassword ? "Hide" : "Show"}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.button, busy && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{busy ? "Signing in..." : "Sign In"}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onForgotPassword}>
          <Text style={styles.forgot}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowAdvanced((v) => !v)}>
          <Text style={styles.advancedToggle}>
            {showAdvanced ? "Hide" : "Advanced"} server settings
          </Text>
        </TouchableOpacity>
        {showAdvanced && (
          <View>
            <Text style={styles.label}>Server URL</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://xxxx.trycloudflare.com"
            />
            <Text style={styles.hint}>
              Paste your backend/tunnel URL here (no trailing slash).
            </Text>
          </View>
        )}

            <Text style={styles.hint}>
              Accounts are created by your society admin.{"\n"}Contact them if you can't sign in.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0B3A49" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6, 40, 52, 0.38)" },
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  logoWrap: { alignItems: "center", marginBottom: 20 },
  logo: { fontSize: 48, fontWeight: "800", color: "#fff", letterSpacing: 2, textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  tagline: { color: "#EAF6FA", marginTop: 4, fontSize: 14, textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  card: {
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#F8FAFB",
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 10,
    backgroundColor: "#F8FAFB",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  showBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  showBtnText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  button: {
    backgroundColor: "#0B6E8F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  forgot: { color: "#0B6E8F", fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: 14 },
  advancedToggle: { color: "#0B6E8F", fontWeight: "600", fontSize: 13, textAlign: "center", marginTop: 16 },
  hint: { color: "#8895A0", fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18 },
});
