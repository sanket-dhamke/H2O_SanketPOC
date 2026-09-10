import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Compact month-grid date picker (web + native). Emits ISO "YYYY-MM-DD".
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

  const close = () => setOpen(false);

  const openPicker = () => {
    setView(parseISO(value) || new Date());
    setOpen(true);
  };

  const pick = (day) => {
    const d = new Date(view.getFullYear(), view.getMonth(), day);
    onChange?.(toISO(d));
    close();
  };

  const selectToday = () => {
    onChange?.(toISO(new Date()));
    close();
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

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close calendar" />
          <View style={styles.card}>
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => setView(new Date(y, m - 1, 1))}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Previous month"
              >
                <Ionicons name="chevron-back" size={20} color="#0B6E8F" />
              </TouchableOpacity>
              <Text style={styles.headerText}>
                {MONTHS[m]} {y}
              </Text>
              <TouchableOpacity
                onPress={() => setView(new Date(y, m + 1, 1))}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Next month"
              >
                <Ionicons name="chevron-forward" size={20} color="#0B6E8F" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={close}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Close calendar"
              >
                <Ionicons name="close" size={18} color="#5C7380" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w, i) => (
                <Text key={i} style={styles.weekday}>
                  {w}
                </Text>
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
                    style={styles.cell}
                    onPress={() => !disabled && pick(day)}
                    disabled={disabled}
                  >
                    <View style={[styles.day, isSel && styles.daySel, isToday && !isSel && styles.dayToday, disabled && styles.dayDisabled]}>
                      <Text style={[styles.dayText, isSel && styles.dayTextSel, disabled && styles.dayTextDisabled]}>{day}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity onPress={() => { onChange?.(""); close(); }}>
                <Text style={styles.clear}>Clear</Text>
              </TouchableOpacity>
              <View style={styles.footerRight}>
                <TouchableOpacity onPress={selectToday} style={styles.ghostBtn}>
                  <Text style={styles.ghostText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={close} style={styles.doneBtn}>
                  <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
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
  overlay: {
    flex: 1,
    backgroundColor: "rgba(6,20,26,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    zIndex: 1,
    shadowColor: "#0B3A49",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  headerText: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: "#1B2B33" },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F5F7",
    alignItems: "center",
    justifyContent: "center",
  },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { width: `${100 / 7}%`, textAlign: "center", color: "#8895A0", fontWeight: "700", fontSize: 11 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 36, alignItems: "center", justifyContent: "center" },
  day: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  daySel: { backgroundColor: "#0B6E8F" },
  dayToday: { backgroundColor: "#E7F1F5" },
  dayDisabled: { opacity: 0.35 },
  dayText: { fontSize: 13, color: "#1B2B33", fontWeight: "600" },
  dayTextSel: { color: "#fff", fontWeight: "800" },
  dayTextDisabled: { color: "#8895A0" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  clear: { color: "#C2571A", fontWeight: "700", fontSize: 13, paddingVertical: 6, paddingHorizontal: 4 },
  ghostBtn: { backgroundColor: "#EFF5F7", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  ghostText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  doneBtn: { backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  doneText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
