import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { body } from "../lib/type";

const STACK = [
  { key: "approved", label: "Approved", color: "#1E7A3D" },
  { key: "pending", label: "Pending", color: "#C2571A" },
  { key: "rejected", label: "Rejected", color: "#B42318" },
  { key: "leave_at_gate", label: "Left at gate", color: "#0B6E8F" },
];

function monthTotal(d) {
  if (!d) return 0;
  if (d.approved != null || d.pending != null || d.rejected != null) {
    return (d.approved || 0) + (d.pending || 0) + (d.rejected || 0) + (d.leave_at_gate || 0) + (d.other || 0);
  }
  return d.value || 0;
}

function hasStatusSplit(data) {
  return data.some((d) => d.approved != null || d.pending != null || d.rejected != null);
}

// Last-few-months bar strip. When the API sends status counts, each bar is
// stacked Approved (green) / Pending (orange) / Rejected (red).
export default function TrendBars({ data = [], color = "#0B6E8F", height = 72, suffix = "", showLegend = true }) {
  const stacked = hasStatusSplit(data);
  const peak = Math.max(1, ...data.map(monthTotal));

  return (
    <View>
      {stacked && showLegend ? (
        <View style={styles.legend}>
          {STACK.filter((s) => s.key !== "leave_at_gate" || data.some((d) => d.leave_at_gate > 0)).map((s) => (
            <View key={s.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.wrap}>
        {data.map((d, i) => {
          const isLast = i === data.length - 1;
          const total = monthTotal(d);
          return (
            <View key={d.period || d.label} style={styles.col}>
              <Text style={[styles.value, isLast && { color: "#1B2B33", fontWeight: "800" }]}>
                {total}
                {suffix}
              </Text>
              <View style={[styles.track, { height }]}>
                {stacked ? (
                  <StackedBar d={d} peak={peak} height={height} />
                ) : (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(3, Math.round((total / peak) * height)),
                        backgroundColor: isLast ? color : `${color}59`,
                      },
                    ]}
                  />
                )}
              </View>
              <Text style={[styles.label, isLast && { color: "#1B2B33", fontWeight: "700" }]}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StackedBar({ d, peak, height }) {
  const parts = STACK.map((s) => ({ ...s, value: d[s.key] || 0 })).filter((s) => s.value > 0);
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (!total) {
    return <View style={[styles.bar, { height: 3, backgroundColor: "#E6EDF0" }]} />;
  }
  const stackH = Math.max(6, Math.round((total / peak) * height));
  return (
    <View style={[styles.stack, { height: stackH }]}>
      {parts.map((p, i) => {
        const h = Math.max(3, Math.round((p.value / total) * stackH));
        return (
          <View
            key={p.key}
            style={{
              height: h,
              backgroundColor: p.color,
              width: "100%",
              borderTopLeftRadius: i === parts.length - 1 ? 6 : 0,
              borderTopRightRadius: i === parts.length - 1 ? 6 : 0,
              borderBottomLeftRadius: i === 0 ? 6 : 0,
              borderBottomRightRadius: i === 0 ? 6 : 0,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: "#6B7B85", ...body(600) },
  wrap: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  col: { flex: 1, alignItems: "center" },
  value: { fontSize: 11, color: "#8895A0", marginBottom: 4, ...body(400) },
  track: { width: "100%", justifyContent: "flex-end" },
  stack: { width: "100%", justifyContent: "flex-end", overflow: "hidden" },
  bar: { width: "100%", borderRadius: 6, minHeight: 3 },
  label: { fontSize: 11, color: "#8895A0", marginTop: 6, ...body(400) },
});
