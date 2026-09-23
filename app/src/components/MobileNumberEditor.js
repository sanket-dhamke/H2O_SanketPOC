import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TextInput from "./AppTextInput";
import { displayMobile, saveMobileNumber } from "../lib/mobileNumber";

// Where a resident adds the number Razorpay would otherwise ask for again.
export default function MobileNumberEditor({ user, updateUser }) {
  const [editing, setEditing] = useState(!user?.phone);
  const [draft, setDraft] = useState(user?.phone || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const phone = await saveMobileNumber(user.id, draft);
      updateUser({ phone });
      setDraft(phone || "");
      setEditing(false);
    } catch (e) {
      setError(e.message || "Couldn't save the number.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="call-outline" size={18} color="#0B6E8F" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mobile number</Text>
          <Text style={styles.value}>{user?.phone ? displayMobile(user.phone) : "Not added yet"}</Text>
        </View>
        {!editing ? (
          <TouchableOpacity
            onPress={() => {
              setDraft(user?.phone || "");
              setError("");
              setEditing(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.link}>{user?.phone ? "Change" : "Add"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.hint}>Payment uses this number, so Razorpay will not ask for it again.</Text>
      {editing ? (
        <View style={styles.edit}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="10-digit mobile"
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            {user?.phone ? (
              <TouchableOpacity
                style={styles.cancel}
                onPress={() => {
                  setEditing(false);
                  setError("");
                }}
                disabled={busy}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.save, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: "#1B2B33", fontWeight: "700", fontSize: 15 },
  value: { color: "#48606B", fontSize: 13, marginTop: 2 },
  link: { color: "#0B6E8F", fontWeight: "800", fontSize: 14 },
  hint: { color: "#6B7B85", fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  edit: { marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    backgroundColor: "#F8FAFB",
  },
  error: { color: "#B4381F", fontSize: 12.5, marginTop: 6 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  cancel: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
  save: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, minWidth: 72, alignItems: "center" },
  saveText: { color: "#fff", fontWeight: "800" },
});
