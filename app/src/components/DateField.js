import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// A lightweight, dependency-free date picker that works identically on web and
// native. Renders a tappable field; tapping opens a month-grid calendar. Emits
// the picked date as an ISO "YYYY-MM-DD" string via onChange (or "" when cleared).
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseISO(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function prettyLabel(s) {
  const d = parseISO(s);
  if (!d) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export default function DateField({ value, onChange, placeholder = "Select a date", style, minToday = false }) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);
  const [view, setView] = useState(() => selected || new Date());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openPicker = () => {
    setView(parseISO(value) || new Date());
    setOpen(true);
  };

  const pick = (day) => {
    const d = new Date(view.getFullYear(), view.getMonth(), day);
    onChange?.(toISO(d));
    setOpen(false);
  };

  const selectToday = () => {
    onChange?.(toISO(new Date()));
    setOpen(false);
  };

  const y = view.getFullYear();
  const m = view.getMonth();
  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const label = prettyLabel(value);

  return (
    <>
      <TouchableOpacity style={[styles.field, style]} onPress={openPicker} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={18} color="#0B6E8F" />
        <Text style={[styles.fieldText, !label && styles.placeholder]}>{label || placeholder}</Text>
        {!!value && (
          <TouchableOpacity onPress={() => onChange?.("")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={18} color="#B7C2C9" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setView(new Date(y, m - 1, 1))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={22} color="#0B6E8F" />
              </TouchableOpacity>
              <Text style={styles.headerText}>{MONTHS[m]} {y}</Text>
              <TouchableOpacity onPress={() => setView(new Date(y, m + 1, 1))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-forward" size={22} color="#0B6E8F" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w, i) => (
                <Text key={i} style={styles.weekday}>{w}</Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day == null) return <View key={i} style={styles.cell} />;
                const d = new Date(y, m, day);
                const isSel = selected && toISO(selected) === toISO(d);
                const isToday = toISO(d) === toISO(today);
                const disabled = minToday && d < today;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.cell, isSel && styles.cellSel, isToday && !isSel && styles.cellToday, disabled && styles.cellDisabled]}
                    onPress={() => !disabled && pick(day)}
                    disabled={disabled}
                  >
                    <Text style={[styles.cellText, isSel && styles.cellTextSel, disabled && styles.cellTextDisabled]}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity onPress={() => { onChange?.(""); setOpen(false); }}>
                <Text style={styles.clear}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={selectToday} style={styles.todayBtn}>
                <Text style={styles.todayText}>Today</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F8FAFB",
  },
  fieldText: { flex: 1, fontSize: 15, color: "#1B2B33" },
  placeholder: { color: "#8895A0" },
  overlay: { flex: 1, backgroundColor: "rgba(6,20,26,0.5)", justifyContent: "center", padding: 28 },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerText: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  weekRow: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", color: "#8895A0", fontWeight: "700", fontSize: 12, marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  cellSel: { backgroundColor: "#0B6E8F" },
  cellToday: { backgroundColor: "#E7F1F5" },
  cellDisabled: { opacity: 0.35 },
  cellText: { fontSize: 14, color: "#1B2B33", fontWeight: "600" },
  cellTextSel: { color: "#fff", fontWeight: "800" },
  cellTextDisabled: { color: "#8895A0" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  clear: { color: "#C2571A", fontWeight: "700", fontSize: 14, paddingVertical: 6, paddingHorizontal: 8 },
  todayBtn: { backgroundColor: "#EFF5F7", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  todayText: { color: "#0B6E8F", fontWeight: "700" },
});
