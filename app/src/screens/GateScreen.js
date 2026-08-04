import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Platform,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import TextInput from "../components/AppTextInput";
import * as ImagePicker from "expo-image-picker";
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { labelsFor, isPreschool } from "../lib/org";
import ScreenHeader from "../components/ScreenHeader";

const PURPOSES = ["Guest", "Delivery", "Cab", "Service", "Other"];
const PRESCHOOL_PURPOSES = ["Pickup", "Drop", "Guest", "Delivery", "Service", "Other"];

export default function GateScreen({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const preschool = isPreschool(user);
  const purposes = preschool ? PRESCHOOL_PURPOSES : PURPOSES;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [flats, setFlats] = useState([]);
  const [flatId, setFlatId] = useState(null);
  const [purpose, setPurpose] = useState(preschool ? "Pickup" : "Guest");
  const [photo, setPhoto] = useState(null); // { uri, base64 }
  const [busy, setBusy] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [verifyModal, setVerifyModal] = useState(false);

  const flatsRef = useRef([]);
  useEffect(() => {
    api
      .flats()
      .then(({ flats }) => {
        setFlats(flats);
        flatsRef.current = flats;
      })
      .catch(() => {});
  }, []);

  // Apply the fields the AI extracted from the guard's speech to the form.
  const applyParsedFields = (fields) => {
    if (!fields) return;
    if (fields.name) setName(fields.name);
    if (fields.phone) setPhone(fields.phone);
    if (fields.vehicleNo) setVehicleNo(fields.vehicleNo);
    if (fields.purpose && purposes.includes(fields.purpose)) setPurpose(fields.purpose);
    if (fields.flatNo) {
      const match = flatsRef.current.find(
        (f) => f.flatNo.toLowerCase() === String(fields.flatNo).toLowerCase()
      );
      if (match) setFlatId(match.id);
    }
  };

  const startRecording = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone needed", "Please allow microphone access to dictate details.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
    } catch (e) {
      Alert.alert("Recording failed", e.message);
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    setVoiceBusy(true);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      setIsRecording(false);
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { fields } = await api.aiVoiceVisitor({
        audioBase64: `data:audio/m4a;base64,${base64}`,
      });
      applyParsedFields(fields);
      Alert.alert("Got it", "Review the details below and tap Notify.");
    } catch (e) {
      Alert.alert("Voice entry failed", e.message);
    } finally {
      setVoiceBusy(false);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera needed", "Please allow camera access to photograph the visitor.");
        return;
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setPhoto({ uri: asset.uri, base64: `data:image/jpeg;base64,${asset.base64}` });
    }
  };

  const reset = () => {
    setName("");
    setPhone("");
    setVehicleNo("");
    setFlatId(null);
    setPurpose(preschool ? "Pickup" : "Guest");
    setPhoto(null);
  };

  const submit = async () => {
    if (!name.trim() || !flatId) {
      Alert.alert("Missing info", `Visitor name and ${L.unit.toLowerCase()} are required.`);
      return;
    }
    setBusy(true);
    try {
      await api.addVisitor({
        name: name.trim(),
        phone: phone.trim(),
        vehicleNo: vehicleNo.trim(),
        flatId,
        purpose,
        photoBase64: photo?.base64 || null,
      });
      const flat = flats.find((f) => f.id === flatId);
      reset();
      if (preschool) {
        // Entry is logged directly (no approval) — CLO is notified. Stay here
        // so the guard can quickly log the next visitor.
        Alert.alert("Entry logged", `${flat?.flatNo || "Entry"} logged. The CLO has been notified.`);
      } else {
        Alert.alert("Sent", `Residents of ${flat?.flatNo || "the flat"} have been notified.`);
        navigation.navigate("Visitors");
      }
    } catch (e) {
      Alert.alert("Failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader icon="person-add" title="New visitor" subtitle="Log an entry at the gate" />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity
        style={[styles.voiceBtn, isRecording && styles.voiceBtnActive, voiceBusy && { opacity: 0.6 }]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={voiceBusy}
      >
        <Text style={styles.voiceBtnText}>
          {voiceBusy
            ? "Transcribing..."
            : isRecording
              ? "◼  Stop & fill form"
              : "🎤  Dictate details (AI)"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.passBtn} onPress={() => setVerifyModal(true)}>
        <Ionicons name="qr-code-outline" size={18} color="#2E9E52" />
        <Text style={styles.passBtnText}>Admit a pre-approved pass</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.photoBox} onPress={takePhoto}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoIcon}>+</Text>
            <Text style={styles.photoText}>Take visitor photo</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Visitor name *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Ramesh Kumar" />

      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Optional" />

      <Text style={styles.label}>Vehicle number</Text>
      <TextInput style={styles.input} value={vehicleNo} onChangeText={setVehicleNo} autoCapitalize="characters" placeholder="Optional (e.g. MH12AB1234)" />

      <Text style={styles.label}>{L.unit} *</Text>
      <View style={styles.chips}>
        {flats.map((f) => {
          // In societies a flat with no resident account can't receive a visitor
          // to approve, so block it here (clear reason) instead of failing on submit.
          const noResident = !preschool && (f.residentCount ?? 1) === 0;
          return (
            <TouchableOpacity
              key={f.id}
              style={[styles.chip, flatId === f.id && styles.chipActive, noResident && styles.chipDisabled]}
              onPress={() =>
                noResident
                  ? Alert.alert(
                      "No resident yet",
                      `${f.flatNo} has no resident account yet, so nobody can approve the visitor. Ask the admin to add a resident for ${f.flatNo}.`
                    )
                  : setFlatId(f.id)
              }
            >
              <Text
                style={[
                  styles.chipText,
                  flatId === f.id && styles.chipTextActive,
                  noResident && styles.chipTextDisabled,
                ]}
              >
                {f.flatNo}
              </Text>
            </TouchableOpacity>
          );
        })}
        {flats.length === 0 && <Text style={styles.hint}>Loading {L.units.toLowerCase()}...</Text>}
      </View>
      {!preschool && flats.some((f) => (f.residentCount ?? 1) === 0) && (
        <Text style={styles.hint}>
          Greyed {L.units.toLowerCase()} have no resident account yet — ask the admin to add one.
        </Text>
      )}

      <Text style={styles.label}>Purpose</Text>
      <View style={styles.chips}>
        {purposes.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, purpose === p && styles.chipActive]}
            onPress={() => setPurpose(p)}
          >
            <Text style={[styles.chipText, purpose === p && styles.chipTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        <Text style={styles.buttonText}>
          {busy ? (preschool ? "Logging..." : "Notifying...") : preschool ? "Log entry & notify CLO" : "Notify resident"}
        </Text>
      </TouchableOpacity>
      </ScrollView>
      <GatePassVerifyModal visible={verifyModal} onClose={() => setVerifyModal(false)} />
    </View>
  );
}

function GatePassVerifyModal({ visible, onClose }) {
  const [code, setCode] = useState("");
  const [pass, setPass] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCode("");
    setPass(null);
  };

  const check = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const { pass } = await api.verifyGatePass(code.trim());
      setPass(pass);
    } catch (e) {
      setPass(null);
      Alert.alert("Not found", e.message);
    } finally {
      setBusy(false);
    }
  };

  const admit = async () => {
    setBusy(true);
    try {
      await api.admitGatePass(pass.id);
      Alert.alert("Admitted", `${pass.guestName} admitted. The resident has been notified.`);
      reset();
      onClose();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="qr-code-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Pre-approved pass</Text>
          </LinearGradient>
          <View style={styles.modalBody}>
            <Text style={styles.modalLabel}>Enter the gate code the visitor shows</Text>
            <TextInput style={styles.codeInput} value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" maxLength={6} />
            {pass && (
              <View style={styles.passInfo}>
                <Text style={styles.passName}>{pass.guestName}</Text>
                <Text style={styles.passMeta}>{pass.type?.toUpperCase()} · for {pass.flatNo || "resident"}{pass.createdByName ? ` · ${pass.createdByName}` : ""}</Text>
                {!!pass.vehicleNo && <Text style={styles.passMeta}>Vehicle {pass.vehicleNo}</Text>}
                {!!pass.purpose && <Text style={styles.passMeta}>{pass.purpose}</Text>}
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.mBtn, styles.mCancel]} onPress={() => { reset(); onClose(); }}>
                <Text style={styles.mCancelText}>Close</Text>
              </TouchableOpacity>
              {pass ? (
                <TouchableOpacity style={[styles.mBtn, { backgroundColor: "#2E9E52" }, busy && { opacity: 0.6 }]} onPress={admit} disabled={busy}>
                  <Text style={styles.mBtnText}>{busy ? "Admitting…" : "Admit"}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.mBtn, busy && { opacity: 0.6 }]} onPress={check} disabled={busy}>
                  <Text style={styles.mBtnText}>{busy ? "Checking…" : "Check"}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  title: { fontSize: 22, fontWeight: "800", color: "#1B2B33", marginBottom: 8 },
  voiceBtn: { backgroundColor: "#E7F1F5", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  voiceBtnActive: { backgroundColor: "#FCEEE2" },
  voiceBtnText: { color: "#0B6E8F", fontWeight: "700", fontSize: 15 },
  passBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#E3F5E8", borderRadius: 12, paddingVertical: 13, marginTop: 10 },
  passBtnText: { color: "#2E9E52", fontWeight: "700", fontSize: 15 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20 },
  modalLabel: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 8 },
  codeInput: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, fontSize: 24, letterSpacing: 6, textAlign: "center", backgroundColor: "#F8FAFB" },
  passInfo: { backgroundColor: "#F6F9FA", borderRadius: 10, padding: 14, marginTop: 14 },
  passName: { fontSize: 17, fontWeight: "800", color: "#1B2B33" },
  passMeta: { color: "#6B7B85", fontSize: 13, marginTop: 3 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  mBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "700" },
  mCancel: { backgroundColor: "#EEF2F4" },
  mCancelText: { color: "#6B7B85", fontWeight: "700" },
  photoBox: { alignSelf: "center", marginTop: 12, marginBottom: 4 },
  photo: { width: 120, height: 120, borderRadius: 60 },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#E6EDF0",
    borderWidth: 2,
    borderColor: "#B9C9D1",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoIcon: { fontSize: 30, color: "#0B6E8F", fontWeight: "800" },
  photoText: { color: "#6B7B85", fontSize: 11, marginTop: 2 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  hint: { color: "#8895A0", fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D6DEE3",
  },
  chipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  chipDisabled: { backgroundColor: "#EEF1F3", borderColor: "#E1E6E9", opacity: 0.6 },
  chipText: { color: "#334", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  chipTextDisabled: { color: "#A6B0B7" },
  button: {
    backgroundColor: "#0B6E8F",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
