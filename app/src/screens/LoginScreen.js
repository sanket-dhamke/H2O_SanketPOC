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
  Linking,
} from "react-native";
import { useAuth } from "../lib/auth";
import { getBaseUrl, setBaseUrl, getOrgMode, api } from "../lib/api";
import ForgotPasswordModal from "../components/ForgotPasswordModal";

// Extracts a tenant slug from a branded link / deep link, supporting both
// ?t=<slug> query form and /t/<slug> path form.
function slugFromUrl(url) {
  if (!url) return null;
  const q = url.match(/[?&]t=([^&#]+)/);
  if (q) return decodeURIComponent(q[1]);
  const p = url.match(/\/t\/([^/?#]+)/);
  if (p) return decodeURIComponent(p[1]);
  return null;
}

// Login is shared across tenants. The user picks their org type so we can show
// the right backdrop + wording. Wide art on web (landscape), portrait on phones.
const isWeb = Platform.OS === "web";
const BACKDROPS = {
  society: {
    image: isWeb ? require("../../assets/society-bg-wide.png") : require("../../assets/society-bg.png"),
    tagline: "Your society, simplified",
    emailPlaceholder: "you@society.com",
    hint: "Accounts are created by your society admin.\nContact them if you can't sign in.",
  },
  preschool: {
    image: isWeb ? require("../../assets/preschool-bg-wide.png") : require("../../assets/preschool-bg.png"),
    tagline: "Smart preschool entry & fees",
    emailPlaceholder: "you@preschool.com",
    hint: "Accounts are created by your preschool admin.\nContact them if you can't sign in.",
  },
};

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [orgMode, setOrgMode] = useState("society"); // "society" | "preschool"
  const [tenantName, setTenantName] = useState(null);
  const passwordRef = useRef(null);
  const theme = BACKDROPS[orgMode];

  useEffect(() => {
    getBaseUrl().then(setServerUrl);
  }, []);

  // Auto-brand the login: 1) from a branded link/QR (?t=slug or /t/slug), else
  // 2) from the tenant type remembered after the last successful login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let launchUrl = null;
      if (Platform.OS === "web" && typeof window !== "undefined") {
        launchUrl = window.location?.href || null;
      } else {
        try {
          launchUrl = await Linking.getInitialURL();
        } catch {}
      }
      const slug = slugFromUrl(launchUrl);
      if (slug) {
        try {
          const b = await api.tenantBranding(slug);
          if (!cancelled) {
            setOrgMode(b.orgType === "preschool" ? "preschool" : "society");
            setTenantName(b.name);
          }
          return;
        } catch {}
      }
      const remembered = await getOrgMode();
      if (!cancelled && remembered) setOrgMode(remembered);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    <ImageBackground source={theme.image} style={styles.bg} resizeMode="cover">
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
            <Text style={styles.tagline}>{theme.tagline}</Text>
          </View>

          <View style={styles.card}>
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segBtn, orgMode === "society" && styles.segBtnActive]}
            onPress={() => setOrgMode("society")}
          >
            <Text style={[styles.segText, orgMode === "society" && styles.segTextActive]}>🏢 Society</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, orgMode === "preschool" && styles.segBtnActive]}
            onPress={() => setOrgMode("preschool")}
          >
            <Text style={[styles.segText, orgMode === "preschool" && styles.segTextActive]}>🏫 Preschool</Text>
          </TouchableOpacity>
        </View>
        {tenantName ? (
          <Text style={styles.tenantName}>Signing in to {tenantName}</Text>
        ) : null}
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={theme.emailPlaceholder}
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

        <TouchableOpacity onPress={() => setForgotOpen(true)}>
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

            <Text style={styles.hint}>{theme.hint}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ForgotPasswordModal
        visible={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={email.trim()}
      />
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
  segment: { flexDirection: "row", backgroundColor: "#EEF3F5", borderRadius: 10, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  segBtnActive: { backgroundColor: "#0B6E8F" },
  segText: { fontSize: 13, fontWeight: "700", color: "#5B6B74" },
  segTextActive: { color: "#fff" },
  tenantName: { textAlign: "center", color: "#0B6E8F", fontWeight: "700", fontSize: 14, marginTop: 12 },
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
