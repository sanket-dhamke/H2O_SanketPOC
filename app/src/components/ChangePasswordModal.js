import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";

// Self-service "change my password" modal used by every role. Verifies the
// current password on the server and enforces the password policy.
export default function ChangePasswordModal({ visible, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShow(false);
  };

  const submit = async () => {
    if (!current || !next) {
      Alert.alert("Missing info", "Enter your current and new password.");
      return;
    }
    if (next !== confirm) {
      Alert.alert("Passwords don't match", "The new password and confirmation are different.");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      reset();
      onClose();
      Alert.alert("Password changed", "Your password has been updated.");
    } catch (e) {
      Alert.alert("Could not change password", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient
            colors={["#0E85AC", "#0B6E8F", "#075064"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerIcon}>
              <Ionicons name="key-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>Change password</Text>
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Current password</Text>
            <TextInput
              style={styles.input}
              value={current}
              onChangeText={setCurrent}
              secureTextEntry={!show}
              autoCapitalize="none"
              placeholder="Enter current password"
            />
            <Text style={styles.label}>New password</Text>
            <TextInput
              style={styles.input}
              value={next}
              onChangeText={setNext}
              secureTextEntry={!show}
              autoCapitalize="none"
              placeholder="At least 8 chars, 1 upper, 1 lower, 1 number"
            />
            <Text style={styles.label}>Confirm new password</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!show}
              autoCapitalize="none"
              placeholder="Re-enter new password"
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            <TouchableOpacity style={styles.showRow} onPress={() => setShow((v) => !v)}>
              <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color="#0B6E8F" />
              <Text style={styles.showText}>{show ? "Hide passwords" : "Show passwords"}</Text>
            </TouchableOpacity>

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={() => { reset(); onClose(); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                <Text style={styles.btnText}>{busy ? "Saving…" : "Update"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  headerIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  body: { padding: 20, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  showRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  showText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  actions: { flexDirection: "row", gap: 12, marginTop: 22 },
  btn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  cancel: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
