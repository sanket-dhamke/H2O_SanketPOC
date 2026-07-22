import React, { useEffect, useState } from "react";
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

// Self-service password reset. Step 1: request an emailed OTP. Step 2: enter the
// code + a new password. In DEV mode (no email provider on the server) the API
// returns the code so it can be shown here for testing.
export default function ForgotPasswordModal({ visible, onClose, initialEmail = "" }) {
  const [step, setStep] = useState("request");
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [devOtp, setDevOtp] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep("request");
      setEmail(initialEmail);
      setOtp("");
      setPassword("");
      setConfirm("");
      setShow(false);
      setDevOtp(null);
    }
  }, [visible, initialEmail]);

  const sendCode = async () => {
    if (!email.trim()) {
      Alert.alert("Enter your email", "Type the email you use to sign in.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.forgotPassword(email.trim());
      setDevOtp(res.devOtp || null);
      if (res.devOtp) setOtp(res.devOtp);
      setStep("reset");
      if (res.deliveryWarning) Alert.alert("Heads up", res.deliveryWarning);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (!otp.trim() || !password) {
      Alert.alert("Missing info", "Enter the code and your new password.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", "The new password and confirmation are different.");
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(email.trim(), otp.trim(), password);
      onClose();
      Alert.alert("Password reset", "Your password has been updated. You can now sign in.");
    } catch (e) {
      Alert.alert("Couldn't reset password", e.message);
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
              <Ionicons name="lock-closed-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>Reset password</Text>
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {step === "request" ? (
              <>
                <Text style={styles.intro}>
                  Enter your account email and we'll send a 6-digit reset code.
                </Text>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@society.com"
                  onSubmitEditing={sendCode}
                  returnKeyType="send"
                />
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={onClose}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={sendCode} disabled={busy}>
                    <Text style={styles.btnText}>{busy ? "Sending…" : "Send code"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.intro}>
                  We sent a code to <Text style={{ fontWeight: "800" }}>{email.trim()}</Text>. Enter it
                  below with your new password.
                </Text>
                {!!devOtp && (
                  <View style={styles.devBanner}>
                    <Ionicons name="information-circle-outline" size={16} color="#9A3412" />
                    <Text style={styles.devText}>
                      Dev mode (no email provider set): your code is {devOtp}
                    </Text>
                  </View>
                )}
                <Text style={styles.label}>Reset code</Text>
                <TextInput
                  style={styles.input}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  placeholder="6-digit code"
                  maxLength={6}
                />
                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
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
                  onSubmitEditing={doReset}
                  returnKeyType="go"
                />
                <TouchableOpacity style={styles.showRow} onPress={() => setShow((v) => !v)}>
                  <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color="#0B6E8F" />
                  <Text style={styles.showText}>{show ? "Hide passwords" : "Show passwords"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStep("request")}>
                  <Text style={styles.resend}>Use a different email / resend code</Text>
                </TouchableOpacity>

                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={onClose}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={doReset} disabled={busy}>
                    <Text style={styles.btnText}>{busy ? "Saving…" : "Reset password"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden", maxWidth: 420, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  headerIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  body: { padding: 20, paddingTop: 16 },
  intro: { color: "#48606B", fontSize: 13.5, lineHeight: 20, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB" },
  devBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FBE9D8", borderRadius: 10, padding: 10, marginTop: 12 },
  devText: { color: "#9A3412", fontSize: 12.5, fontWeight: "600", flex: 1 },
  showRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  showText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  resend: { color: "#0B6E8F", fontWeight: "700", fontSize: 13, marginTop: 14 },
  actions: { flexDirection: "row", gap: 12, marginTop: 22 },
  btn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  cancel: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
});
