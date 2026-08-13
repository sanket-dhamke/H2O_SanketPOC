import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppTextInput from "./AppTextInput";

// A compact, searchable single-select for flats/units. Replaces long walls of
// chips: shows just the selected value; tapping opens a modal with a search box
// and a scrollable list so an admin/guard can jump straight to any flat by
// typing (e.g. "A-1002") instead of scrolling through hundreds.
//
// Props:
//   flats:       [{ id, flatNo, block?, disabled?, disabledReason? }]
//   value:       selected flat id (or null)
//   onChange:    (flatId) => void
//   placeholder: text when nothing selected
//   onDisabledPress: (flat) => void  (optional; called when a disabled row is tapped)
export default function FlatPicker({
  flats = [],
  value,
  onChange,
  placeholder = "Select a flat",
  onDisabledPress,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = flats.find((f) => f.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flats;
    return flats.filter(
      (f) =>
        f.flatNo?.toLowerCase().includes(q) ||
        (f.block ? f.block.toLowerCase().includes(q) : false)
    );
  }, [flats, query]);

  const pick = (f) => {
    if (f.disabled) {
      onDisabledPress?.(f);
      return;
    }
    onChange?.(f.id);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <TouchableOpacity
        style={styles.field}
        activeOpacity={0.7}
        onPress={() => setOpen(true)}
        disabled={flats.length === 0}
      >
        <Text style={[styles.fieldText, !selected && styles.placeholder]} numberOfLines={1}>
          {flats.length === 0 ? "Loading…" : selected ? selected.flatNo : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#6B7B85" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color="#8895A0" />
              <AppTextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search flat number…"
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7B85" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(f) => f.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              ListEmptyComponent={<Text style={styles.empty}>No matching flats.</Text>}
              renderItem={({ item }) => {
                const isSel = item.id === value;
                return (
                  <TouchableOpacity
                    style={[styles.row, item.disabled && styles.rowDisabled]}
                    onPress={() => pick(item)}
                  >
                    <Text style={[styles.rowText, isSel && styles.rowTextSel, item.disabled && styles.rowTextDisabled]}>
                      {item.flatNo}
                    </Text>
                    {isSel && <Ionicons name="checkmark" size={18} color="#0B6E8F" />}
                    {item.disabled && !isSel && (
                      <Text style={styles.disabledTag}>{item.disabledReason || "unavailable"}</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#fff",
  },
  fieldText: { fontSize: 16, color: "#1B2B33", flex: 1, marginRight: 8, fontWeight: "600" },
  placeholder: { color: "#8895A0", fontWeight: "400" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  sheet: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", paddingBottom: 8 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F4",
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F6F7",
  },
  rowDisabled: { backgroundColor: "#F8FAFB" },
  rowText: { fontSize: 15, color: "#1B2B33", fontWeight: "600" },
  rowTextSel: { color: "#0B6E8F" },
  rowTextDisabled: { color: "#A6B0B7" },
  disabledTag: { color: "#B0803A", fontSize: 11, fontWeight: "600" },
  empty: { textAlign: "center", color: "#6B7B85", padding: 24 },
});
