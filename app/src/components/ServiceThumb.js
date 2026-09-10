import React, { useState } from "react";
import { View, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { toImageSource } from "../lib/serviceImages";

function sourceOf(uri) {
  return toImageSource(uri);
}

// Remote thumbs 404 in some regions. Fall back to a tinted icon so a service
// tile never renders as a blank white box.
export default function ServiceThumb({ uri, icon = "construct", color = "#0B6E8F", style }) {
  const src = sourceOf(uri);
  const [fail, setFail] = useState(!src);
  if (fail) {
    return (
      <View style={[styles.fallback, { backgroundColor: `${color}22` }, style]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
    );
  }
  return (
    <Image
      source={src}
      style={[{ backgroundColor: "#EAF4F7" }, style]}
      resizeMode="cover"
      onError={() => setFail(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
});
