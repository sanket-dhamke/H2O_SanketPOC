import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
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
  const [recording, setRecording] = useState(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

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
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone needed", "Please allow microphone access to dictate details.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
    } catch (e) {
      Alert.alert("Recording failed", e.message);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setVoiceBusy(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
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
        style={[styles.voiceBtn, recording && styles.voiceBtnActive, voiceBusy && { opacity: 0.6 }]}
        onPress={recording ? stopRecording : startRecording}
        disabled={voiceBusy}
      >
        <Text style={styles.voiceBtnText}>
          {voiceBusy
            ? "Transcribing..."
            : recording
              ? "◼  Stop & fill form"
              : "🎤  Dictate details (AI)"}
        </Text>
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
        {flats.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.chip, flatId === f.id && styles.chipActive]}
            onPress={() => setFlatId(f.id)}
          >
            <Text style={[styles.chipText, flatId === f.id && styles.chipTextActive]}>{f.flatNo}</Text>
          </TouchableOpacity>
        ))}
        {flats.length === 0 && <Text style={styles.hint}>Loading {L.units.toLowerCase()}...</Text>}
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  title: { fontSize: 22, fontWeight: "800", color: "#1B2B33", marginBottom: 8 },
  voiceBtn: { backgroundColor: "#E7F1F5", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  voiceBtnActive: { backgroundColor: "#FCEEE2" },
  voiceBtnText: { color: "#0B6E8F", fontWeight: "700", fontSize: 15 },
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
  chipText: { color: "#334", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  button: {
    backgroundColor: "#0B6E8F",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
