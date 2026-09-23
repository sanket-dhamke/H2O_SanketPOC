import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Sits at the right end of a modal header so a long form can be dismissed
// without scrolling down to Cancel.
export default function ModalClose({ onPress, light = true }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel="Close"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[styles.btn, light ? styles.light : styles.dark]}
    >
      <Ionicons name="close" size={20} color={light ? "#fff" : "#1B2B33"} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginLeft: "auto",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  light: { backgroundColor: "rgba(255,255,255,0.22)" },
  dark: { backgroundColor: "#E7EEF1" },
});
