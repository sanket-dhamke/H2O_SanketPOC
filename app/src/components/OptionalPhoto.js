import React, { useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

// A photo is never required. Camera on a phone, or a picture from the device.
export default function OptionalPhoto({ value, onChange, onError }) {
  const [busy, setBusy] = useState(false);

  const pick = async (kind) => {
    setBusy(true);
    try {
      if (Platform.OS !== "web" && kind === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          onError?.("Allow the camera, or skip the photo.");
          return;
        }
      }
      const launch = kind === "camera" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await launch({ quality: 0.4, base64: true, allowsEditing: true, aspect: [1, 1] });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const base64 = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null;
      onChange?.({ uri: asset.uri, base64 });
    } catch (e) {
      onError?.(e.message || "Could not add a photo. You can continue without one.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      {value?.uri ? (
        <Image source={{ uri: value.uri }} style={styles.thumb} />
      ) : (
        <View style={styles.thumb}>
          <Ionicons name="camera-outline" size={20} color="#0B6E8F" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>Photo (optional)</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btn} onPress={() => pick("camera")} disabled={busy}>
            <Text style={styles.btnText}>{busy ? "…" : "Camera"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => pick("library")} disabled={busy}>
            <Text style={styles.btnText}>Gallery</Text>
          </TouchableOpacity>
          {value ? (
            <TouchableOpacity onPress={() => onChange?.(null)}>
              <Text style={styles.clear}>Remove</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  thumb: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: "#E7F3F8",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  label: { color: "#6B7B85", fontSize: 12.5, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  btn: { backgroundColor: "#E7F3F8", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  btnText: { color: "#0B6E8F", fontWeight: "800", fontSize: 12.5 },
  clear: { color: "#8895A0", fontWeight: "700", fontSize: 12.5 },
});
