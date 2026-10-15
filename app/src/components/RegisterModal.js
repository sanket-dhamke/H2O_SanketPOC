import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import TextInput from "./AppTextInput";
import PasswordInput from "./PasswordInput";
import KeyboardAvoider from "./KeyboardAvoider";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";

// Two public registrations share this screen:
// - Resident: society join code + flat. A society admin approves them.
// - Service professional: a separate provider code from the GATEZO owner, plus
//   the services they do. The owner approves them before they can sign in.
export default function RegisterModal({ visible, onClose }) {
  const [mode, setMode] = useState("resident");
  const [joinCode, setJoinCode] = useState("");
  const [flatNo, setFlatNo] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [services, setServices] = useState([]);
  const [serviceSlugs, setServiceSlugs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (visible) {
      setMode("resident");
      setJoinCode("");
      setFlatNo("");
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setConfirm("");
      setServiceSlugs([]);
      setNotice("");
      setSent(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || mode !== "provider" || services.length) return;
    api.providerServices().then((res) => setServices(res.services || [])).catch(() => setServices([]));
  }, [visible, mode, services.length]);

  const toggleSlug = (slug) => {
    setServiceSlugs((list) => (list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]));
  };

  const submit = async () => {
    setNotice("");
    if (password !== confirm) {
      setNotice("The password and confirmation are different.");
      return;
    }
    if (mode === "provider") {
      if (!joinCode.trim() || !name.trim() || !email.trim() || !phone.trim() || !password) {
        setNotice("Fill the provider code, name, email, phone and password.");
        return;
      }
      if (!serviceSlugs.length) {
        setNotice("Choose at least one service you can do.");
        return;
      }
    } else if (!joinCode.trim() || !flatNo.trim() || !name.trim() || !email.trim() || !password) {
      setNotice("Fill the join code, flat, name, email and password.");
      return;
    }
    setBusy(true);
    try {
      const res = mode === "provider"
        ? await api.registerProvider({
            joinCode: joinCode.trim(),
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            password,
            serviceSlugs,
          })
        : await api.register({
            joinCode: joinCode.trim(),
            flatNo: flatNo.trim(),
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            password,
          });
      setNotice(res.message || "You'll be able to sign in once your account is approved.");
      setSent(true);
    } catch (e) {
      setNotice(e.message || "Couldn't register. Check the code and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient
            colors={["#0E85AC", "#0B6E8F", "#075064"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerIcon}>
              <Ionicons name="person-add-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>
              {mode === "provider" ? "Register as a professional" : "Register as a resident"}
            </Text>
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.modes}>
              <TouchableOpacity style={[styles.mode, mode === "resident" && styles.modeOn]} onPress={() => setMode("resident")}>
                <Text style={[styles.modeText, mode === "resident" && styles.modeTextOn]}>Resident</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mode, mode === "provider" && styles.modeOn]} onPress={() => setMode("provider")}>
                <Text style={[styles.modeText, mode === "provider" && styles.modeTextOn]}>Service professional</Text>
              </TouchableOpacity>
            </View>

            {!!notice && (
              <Text style={[styles.notice, sent && styles.noticeOk]} accessibilityRole="alert">
                {notice}
              </Text>
            )}

            {sent ? (
              <TouchableOpacity style={[styles.btn, { marginTop: 16 }]} onPress={onClose}>
                <Text style={styles.btnText}>Close</Text>
              </TouchableOpacity>
            ) : (
            <>
            <Text style={styles.intro}>
              {mode === "provider" ? (
                <>
                  Ask the GATEZO owner for the <Text style={{ fontWeight: "800" }}>provider code</Text>.
                  This is separate from a society join code. The owner approves you before first sign-in.
                </>
              ) : (
                <>
                  Ask your society admin for the <Text style={{ fontWeight: "800" }}>join code</Text>, then
                  register below. Your admin approves new residents before first sign-in.
                </>
              )}
            </Text>

            <Text style={styles.label}>{mode === "provider" ? "Provider code" : "Society join code"}</Text>
            <TextInput
              style={styles.input}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={mode === "provider" ? "e.g. SP7K2QAB" : "e.g. GM7K2Q"}
            />

            {mode === "resident" ? (
              <>
                <Text style={styles.label}>Your flat / unit number</Text>
                <TextInput
                  style={styles.input}
                  value={flatNo}
                  onChangeText={setFlatNo}
                  autoCapitalize="characters"
                  placeholder="e.g. A-1002"
                />
              </>
            ) : null}

            <Text style={styles.label}>Full name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Aarav Sharma" />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@email.com"
            />

            <Text style={styles.label}>{mode === "provider" ? "Phone" : "Phone (optional)"}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder={mode === "provider" ? "Mobile number" : "Optional"}
            />

            {mode === "provider" ? (
              <>
                <Text style={styles.label}>Services you do</Text>
                <View style={styles.chips}>
                  {services.map((s) => {
                    const on = serviceSlugs.includes(s.slug);
                    return (
                      <TouchableOpacity key={s.slug} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleSlug(s.slug)}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!services.length ? <Text style={styles.mismatch}>Service list is still loading. Check the server, then reopen this form.</Text> : null}
              </>
            ) : null}

            <Text style={styles.label}>Password</Text>
            <PasswordInput value={password} onChangeText={setPassword} placeholder="At least 8 chars, 1 upper, 1 lower, 1 number" />

            <Text style={styles.label}>Confirm password</Text>
            <PasswordInput value={confirm} onChangeText={setConfirm} placeholder="Re-enter password" />
            {!!confirm && confirm !== password && (
              <Text style={styles.mismatch}>Passwords don't match yet.</Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.btnText}>{busy ? "Sending…" : "Register"}</Text>
              </TouchableOpacity>
            </View>
            </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden", maxWidth: 440, width: "100%", alignSelf: "center", maxHeight: "88%" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  headerIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  body: { padding: 20, paddingTop: 16 },
  intro: { color: "#48606B", fontSize: 13.5, lineHeight: 20, marginBottom: 4 },
  notice: { backgroundColor: "#FDECEC", color: "#8A1F18", borderRadius: 10, padding: 12, fontSize: 14, lineHeight: 20, marginBottom: 8, fontWeight: "700" },
  noticeOk: { backgroundColor: "#E7F6EE", color: "#0E6B3C" },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  modes: { flexDirection: "row", gap: 8, marginBottom: 12 },
  mode: { flex: 1, borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#F8FAFB" },
  modeOn: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  modeText: { color: "#334", fontWeight: "700", fontSize: 13 },
  modeTextOn: { color: "#fff" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#F8FAFB" },
  chipOn: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  chipText: { color: "#334", fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  mismatch: { color: "#C0392B", fontSize: 12, marginTop: 6 },
  actions: { flexDirection: "row", gap: 12, marginTop: 22 },
  btn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  cancel: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
