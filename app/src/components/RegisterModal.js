import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import TextInput from "./AppTextInput";
import PasswordInput from "./PasswordInput";
import KeyboardAvoider from "./KeyboardAvoider";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";

// Resident self-registration. They enter the society join code (shared by their
// admin) + their flat number, then set their own name/email/password. The
// account is created in a pending state until an admin approves it — so admins
// never hand-create hundreds of logins.
export default function RegisterModal({ visible, onClose }) {
  const [joinCode, setJoinCode] = useState("");
  const [flatNo, setFlatNo] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setJoinCode("");
      setFlatNo("");
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setConfirm("");
    }
  }, [visible]);

  const submit = async () => {
    if (!joinCode.trim() || !flatNo.trim() || !name.trim() || !email.trim() || !password) {
      Alert.alert("Missing info", "Please fill the join code, flat, name, email and password.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", "The password and confirmation are different.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.register({
        joinCode: joinCode.trim(),
        flatNo: flatNo.trim(),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      onClose();
      Alert.alert(
        "Request sent",
        res.message || "You'll be able to sign in once an admin approves your account."
      );
    } catch (e) {
      Alert.alert("Couldn't register", e.message);
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
            <Text style={styles.headerTitle}>Register as a resident</Text>
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>
              Ask your society admin for the <Text style={{ fontWeight: "800" }}>join code</Text>, then
              register below. Your admin approves new residents before first sign-in.
            </Text>

            <Text style={styles.label}>Society join code</Text>
            <TextInput
              style={styles.input}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. GM7K2Q"
            />

            <Text style={styles.label}>Your flat / unit number</Text>
            <TextInput
              style={styles.input}
              value={flatNo}
              onChangeText={setFlatNo}
              autoCapitalize="characters"
              placeholder="e.g. A-1002"
            />

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

            <Text style={styles.label}>Phone (optional)</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Optional" />

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
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  mismatch: { color: "#C0392B", fontSize: 12, marginTop: 6 },
  actions: { flexDirection: "row", gap: 12, marginTop: 22 },
  btn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  cancel: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
