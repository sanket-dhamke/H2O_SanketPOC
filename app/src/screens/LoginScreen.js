import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Linking,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TextInput from "../components/AppTextInput";
import { useAuth } from "../lib/auth";
import { getBaseUrl, setBaseUrl, clearOrgMode, api } from "../lib/api";
import ForgotPasswordModal from "../components/ForgotPasswordModal";
import RegisterModal from "../components/RegisterModal";
import { body, head } from "../lib/type";
import { brand, brandIcon } from "../lib/brand";

function loginErrorMessage(err, orgMode) {
  const raw = String(err?.message || err || "").trim();
  const lower = raw.toLowerCase();
  const org =
    orgMode === "preschool" ? "preschool" : orgMode === "society" ? "society" : "organisation";

  if (!raw) return "Sign-in didn’t work. Please try again.";
  if (/invalid email or password/.test(lower)) {
    return "That email or password isn’t right. Check for typos, or tap Forgot password below.";
  }
  if (/inactive/.test(lower)) {
    return `This ${org} is currently inactive. Contact your admin or ${brand.name} support.`;
  }
  if (/awaiting admin approval/.test(lower)) return raw;
  if (/failed to fetch|network request failed|load failed|networkerror|econnrefused|timed out|can't reach the (gatemate|gatezo) server/.test(lower)) {
    return `Can’t reach the ${brand.name} server. Check your internet, then try again. If you use a custom URL, tap Advanced server settings.`;
  }
  if (/request failed \(5/.test(lower)) {
    return "The server had a problem. Please wait a moment and try again.";
  }
  return raw;
}

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

// One shared, multi-tenant login. It ALWAYS shows a NEUTRAL brand (no
// society/preschool wording) unless the app was opened via a tenant's branded
// link/QR (?t=<slug> or /t/<slug>), in which case it shows that tenant's look.
// The plain URL is always neutral — branding is never "sticky" across refresh.
// Wide art on web, portrait on phones.
const isWeb = Platform.OS === "web";
const BACKDROPS = {
  neutral: {
    image: isWeb ? require("../../assets/society-bg-wide.jpg") : require("../../assets/society-bg.jpg"),
    tagline: "Smart living, simplified",
    emailPlaceholder: "you@email.com",
    hint: "Accounts are created by your admin.\nContact them if you can't sign in.",
  },
  society: {
    image: isWeb ? require("../../assets/society-bg-wide.jpg") : require("../../assets/society-bg.jpg"),
    tagline: "Your society, simplified",
    emailPlaceholder: "you@society.com",
    hint: "Accounts are created by your society admin.\nContact them if you can't sign in.",
  },
  preschool: {
    image: isWeb ? require("../../assets/preschool-bg-wide.jpg") : require("../../assets/preschool-bg.jpg"),
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
  const [registerOpen, setRegisterOpen] = useState(false);
  const [orgMode, setOrgMode] = useState("neutral"); // "neutral" | "society" | "preschool"
  const [tenantName, setTenantName] = useState(null);
  const [error, setError] = useState("");
  const passwordRef = useRef(null);
  const theme = BACKDROPS[orgMode];

  useEffect(() => {
    getBaseUrl().then(setServerUrl);
    // Wake a possibly-sleeping (cold-start) backend in the background so it's
    // ready by the time the user finishes typing — hides the free-tier spin-up.
    api.warmUp().catch(() => {});
  }, []);

  // Auto-brand the login ONLY from a branded link/QR (?t=slug or /t/slug).
  // With no such link, we stay neutral — branding is never remembered/sticky,
  // so a plain refresh always returns to the neutral GATEZO login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Clear any previously-remembered tenant so it can never re-stick.
      clearOrgMode().catch(() => {});
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
        } catch {}
      }
      // No slug → remain on the neutral default set in useState.
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Please enter both your email and password.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await setBaseUrl(serverUrl);
      await login(email.trim(), password);
    } catch (e) {
      setError(loginErrorMessage(e, orgMode));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.bg}>
      <BleedPhoto source={theme.image} />
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
            <View style={styles.lockup}>
              <Image source={brandIcon} style={styles.logoMark} resizeMode="cover" />
              <Text style={styles.logo}>{brand.name}</Text>
            </View>
            <Text style={styles.tagline}>{theme.tagline}</Text>
          </View>

          <View style={styles.card}>
        {tenantName ? (
          <Text style={styles.tenantName}>Signing in to {tenantName}</Text>
        ) : null}
        <Text style={styles.signIn}>Sign in</Text>
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (error) setError("");
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#8895A0"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <View style={[styles.passwordRow, error ? styles.inputError : null]}>
          <TextInput
            ref={passwordRef}
            style={styles.passwordInput}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (error) setError("");
            }}
            secureTextEntry={!showPassword}
            placeholder="Password"
            placeholderTextColor="#8895A0"
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
        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle" size={18} color="#B42318" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, busy && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{busy ? "Signing in..." : "Sign In"}</Text>
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <TouchableOpacity onPress={() => setForgotOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={styles.footerLink}>Forgot password?</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setRegisterOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={styles.footerLink}>Register</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => setShowAdvanced((v) => !v)}>
          <Text style={styles.advancedToggle}>
            {showAdvanced ? "Hide" : "Advanced"} server settings
          </Text>
        </TouchableOpacity>
        {showAdvanced && (
          <View>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="Server URL"
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
      <RegisterModal visible={registerOpen} onClose={() => setRegisterOpen(false)} />
    </View>
  );
}

function BleedPhoto({ source }) {
  const [box, setBox] = useState(() => Dimensions.get("window"));
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => setBox(window));
    return () => sub?.remove?.();
  }, []);
  return (
    <Image
      source={source}
      resizeMode="cover"
      style={[
        styles.bleed,
        {
          width: box.width,
          height: box.height,
          maxWidth: box.width,
          maxHeight: box.height,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0B3A49", overflow: "hidden" },
  bleed: {
    position: "absolute",
    top: 0,
    left: 0,
    ...(Platform.OS === "web" ? { objectFit: "cover" } : null),
  },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6, 40, 52, 0.38)" },
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  logoWrap: { alignItems: "center", marginBottom: 40 },
  lockup: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: { width: 36, height: 36, borderRadius: 9 },
  logo: {
    fontSize: 28,
    ...head(800),
    color: "#fff",
    letterSpacing: 1.4,
    textShadowColor: "rgba(0,0,0,0.28)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  tagline: { color: "#EAF6FA", marginTop: 10, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", ...body(600), textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  tenantName: { textAlign: "center", color: "#0B6E8F", ...body(700), fontSize: 13, marginBottom: 8 },
  signIn: { textAlign: "center", color: "#1B2B33", fontSize: 22, marginBottom: 28, ...head(700) },
  input: {
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 22,
    color: "#1B2B33",
    backgroundColor: "#fff",
    marginBottom: 16,
    ...body(400),
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 8,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 22,
    color: "#1B2B33",
    // Android bug: a secureTextEntry field ignores `color` for the masked dots
    // unless a NON-DEFAULT fontFamily is set — "monospace" reliably forces the
    // typed password to render dark (visible) instead of faint/white.
    ...Platform.select({ android: { fontFamily: "monospace" }, default: {} }),
  },
  inputError: { borderColor: "#E8A199", backgroundColor: "#FFF8F7" },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: "#FDECEC",
    borderWidth: 1,
    borderColor: "#F3C4C0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { flex: 1, color: "#8A1F18", fontSize: 13, lineHeight: 18, ...body(600) },
  showBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  showBtnText: { color: "#0B6E8F", ...body(600), fontSize: 14 },
  button: {
    backgroundColor: "#0B6E8F",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", ...body(700), fontSize: 16 },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },
  footerLink: { color: "#0B6E8F", ...body(600), fontSize: 14 },
  advancedToggle: { color: "#8895A0", ...body(500), fontSize: 12, textAlign: "center", marginTop: 16 },
  hint: { color: "#8895A0", fontSize: 12, textAlign: "center", marginTop: 14, lineHeight: 18, ...body(400) },
});
