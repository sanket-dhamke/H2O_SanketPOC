import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { initials, colorForName } from "../lib/social";
import { body } from "../lib/type";

// Initials avatar in a stable per-name colour. Used across the Neighborhood
// feed and profiles so a person looks the same everywhere.
export default function Avatar({ name, size = 46, style, ring }) {
  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colorForName(name) },
        ring && { borderWidth: 3, borderColor: "#fff" },
        style,
      ]}
    >
      <Text style={[styles.text, body(700), { fontSize: Math.round(size * 0.38) }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  text: { color: "#fff", letterSpacing: 0.5 },
});
