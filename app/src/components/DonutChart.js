import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { body, head } from "../lib/type";

// Donut chart drawn with stroke-dasharray arcs — no chart library, so it stays
// light and matches the app's palette exactly. Segments are [{ key, label,
// value, color }]; zero-value segments are skipped so the ring has no seams.
export default function DonutChart({
  segments = [],
  size = 168,
  thickness = 18,
  centerValue,
  centerLabel,
  emptyColor = "#E6EDF0",
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value || 0), 0);

  let offset = 0;
  const arcs = total
    ? segments
        .filter((s) => (s.value || 0) > 0)
        .map((s) => {
          const fraction = s.value / total;
          const arc = {
            key: s.key,
            color: s.color,
            length: circumference * fraction,
            offset: circumference * offset,
          };
          offset += fraction;
          return arc;
        })
    : [];

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} viewBox={`0 0 ${size} ${size}`}>
        {/* Rotate so the first segment starts at 12 o'clock rather than 3. */}
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={emptyColor}
            strokeWidth={thickness}
            fill="none"
          />
          {arcs.map((a) => (
            <Circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={a.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${a.length} ${circumference - a.length}`}
              strokeDashoffset={-a.offset}
            />
          ))}
        </G>
      </Svg>
      <View style={[styles.center, { maxWidth: size * 0.55 }]} pointerEvents="none">
        <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
          {centerValue}
        </Text>
        {centerLabel ? (
          <Text style={styles.centerLabel} numberOfLines={1}>
            {centerLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  centerValue: { fontSize: 22, ...head(800), color: "#0B3A49", textAlign: "center" },
  centerLabel: { fontSize: 11, color: "#6B7B85", marginTop: 1, textAlign: "center", ...body(600) },
});
