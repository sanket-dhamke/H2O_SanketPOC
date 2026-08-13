import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TextInput from "./AppTextInput";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

// Derive a wing/block label for a flat: use the explicit block if present,
// otherwise the part before "-" (e.g. "A-1001" -> "A") or the leading letters
// (e.g. "B204" -> "B"). Falls back to a single "All units" bucket.
export function wingOf(f) {
  if (f.block && String(f.block).trim()) return String(f.block).trim();
  const s = String(f.flatNo || "").trim();
  const dash = s.indexOf("-");
  if (dash > 0) return s.slice(0, dash);
  const m = s.match(/^([A-Za-z]+)/);
  return m ? m[1] : "";
}

// A scalable flat browser: instead of rendering hundreds of rows at once it
// shows a total count + collapsible wing sections (tap a wing to reveal its
// units). A search box filters across every wing and auto-expands matches.
export default function WingedFlats({ flats = [], onSelect, showMoney = true }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({}); // { [wing]: true }

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return flats;
    return flats.filter(
      (f) =>
        String(f.flatNo || "").toLowerCase().includes(q) ||
        String(f.block || "").toLowerCase().includes(q)
    );
  }, [flats, q]);

  const groups = useMemo(() => {
    const map = {};
    for (const f of filtered) {
      const w = wingOf(f) || "\u2014";
      (map[w] = map[w] || []).push(f);
    }
    return Object.entries(map).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }, [filtered]);

  const totalDue = filtered.filter((f) => (f.pending || 0) > 0).length;
  const singleWing = groups.length <= 1;
  const searching = q.length > 0;

  const Row = ({ f }) => (
    <TouchableOpacity style={styles.flatRow} activeOpacity={0.7} onPress={() => onSelect?.(f)}>
      <View style={styles.flatIcon}>
        <Ionicons name="home-outline" size={16} color="#0B6E8F" />
      </View>
      <Text style={styles.flatNo}>{f.flatNo}</Text>
      {showMoney && (f.paid != null || f.pending != null) ? (
        <>
          <Text style={styles.flatPaid}>Paid {money(f.paid)}</Text>
          <Text style={[styles.flatPending, (f.pending || 0) > 0 && { color: "#C2571A" }]}>
            {(f.pending || 0) > 0 ? `Due ${money(f.pending)}` : "Clear"}
          </Text>
        </>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color="#B7C2C9" style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );

  return (
    <View>
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color="#6B7B85" />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search unit or wing"
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color="#B7C2C9" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {filtered.length} unit{filtered.length === 1 ? "" : "s"}
          {!singleWing ? ` \u00b7 ${groups.length} wings` : ""}
        </Text>
        {showMoney && totalDue > 0 && <Text style={styles.summaryDue}>{totalDue} with dues</Text>}
      </View>

      {filtered.length === 0 && <Text style={styles.empty}>No units found.</Text>}

      {/* When searching, or when there's just one wing, show a flat list.
          Otherwise show collapsible wing accordions. */}
      {searching || singleWing
        ? filtered.map((f) => <Row key={f.id} f={f} />)
        : groups.map(([wing, rows]) => {
            const isOpen = !!open[wing];
            const dueCount = rows.filter((r) => (r.pending || 0) > 0).length;
            return (
              <View key={wing} style={styles.wingBlock}>
                <TouchableOpacity
                  style={styles.wingHead}
                  activeOpacity={0.7}
                  onPress={() => setOpen((o) => ({ ...o, [wing]: !o[wing] }))}
                >
                  <View style={styles.wingBadge}>
                    <Text style={styles.wingBadgeText}>{wing}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.wingTitle}>Wing {wing}</Text>
                    <Text style={styles.wingMeta}>
                      {rows.length} unit{rows.length === 1 ? "" : "s"}
                      {showMoney && dueCount > 0 ? ` \u00b7 ${dueCount} with dues` : ""}
                    </Text>
                  </View>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={20} color="#7A8890" />
                </TouchableOpacity>
                {isOpen && rows.map((f) => <Row key={f.id} f={f} />)}
              </View>
            );
          })}
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E3EAEE",
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1B2B33" },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 6 },
  summaryText: { color: "#42525B", fontWeight: "700", fontSize: 13 },
  summaryDue: { color: "#C2571A", fontWeight: "700", fontSize: 12.5 },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 24 },
  wingBlock: { marginTop: 8 },
  wingHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
  },
  wingBadge: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center" },
  wingBadgeText: { color: "#0B6E8F", fontWeight: "800", fontSize: 14 },
  wingTitle: { color: "#1B2B33", fontWeight: "800", fontSize: 14 },
  wingMeta: { color: "#8895A0", fontSize: 12, marginTop: 2 },
  flatRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginLeft: 10,
  },
  flatIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center", marginRight: 10 },
  flatNo: { flex: 1, fontWeight: "700", color: "#1B2B33", fontSize: 14 },
  flatPaid: { color: "#6B7B85", fontSize: 12.5, marginRight: 10 },
  flatPending: { color: "#2E9E52", fontSize: 12.5, fontWeight: "700" },
});
