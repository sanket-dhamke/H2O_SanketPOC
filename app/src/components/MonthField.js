import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// A lightweight, dependency-free MONTH picker (web + native). Tapping the field
// opens a year view with a 12-month grid. Emits the chosen month as
// "YYYY-MM" via onChange. When minCurrent is set, past months are disabled so
// admins can only bill the current or a future month.
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad2 = (n) => String(n).padStart(2, "0");

function parseYM(s) {
  if (!s || !/^\d{4}-\d{2}$/.test(s)) return null;
  const [y, m] = s.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return { y, m };
}

export default function MonthField({ value, onChange, placeholder = "Select month", style, minCurrent = false }) {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  const sel = parseYM(value);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => (sel ? sel.y : curY));

  const label = sel ? `${MONTHS_SHORT[sel.m - 1]} ${sel.y}` : null;

  const openPicker = () => {
    setYear(parseYM(value)?.y || curY);
    setOpen(true);
  };

  const pick = (m) => {
    onChange?.(`${year}-${pad2(m)}`);
    setOpen(false);
  };

  const canGoPrevYear = !minCurrent || year > curY;

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
              <TouchableOpacity
                onPress={() => canGoPrevYear && setYear(year - 1)}
                disabled={!canGoPrevYear}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-back" size={22} color={canGoPrevYear ? "#0B6E8F" : "#CBD5DB"} />
              </TouchableOpacity>
              <Text style={styles.headerText}>{year}</Text>
              <TouchableOpacity onPress={() => setYear(year + 1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-forward" size={22} color="#0B6E8F" />
              </TouchableOpacity>
            </View>

            <View style={styles.grid}>
              {MONTHS_FULL.map((name, i) => {
                const m = i + 1;
                const isSel = sel && sel.y === year && sel.m === m;
                const isCurrent = year === curY && m === curM;
                const disabled = minCurrent && (year < curY || (year === curY && m < curM));
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.cell, isSel && styles.cellSel, isCurrent && !isSel && styles.cellToday, disabled && styles.cellDisabled]}
                    onPress={() => !disabled && pick(m)}
                    disabled={disabled}
                  >
                    <Text style={[styles.cellText, isSel && styles.cellTextSel, disabled && styles.cellTextDisabled]}>
                      {MONTHS_SHORT[i]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity onPress={() => { onChange?.(""); setOpen(false); }}>
                <Text style={styles.clear}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setYear(curY); onChange?.(`${curY}-${pad2(curM)}`); setOpen(false); }}
                style={styles.todayBtn}
              >
                <Text style={styles.todayText}>This month</Text>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  headerText: { fontSize: 16, fontWeight: "800", color: "#1B2B33" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 3}%`, paddingVertical: 14, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  cellSel: { backgroundColor: "#0B6E8F" },
  cellToday: { backgroundColor: "#E7F1F5" },
  cellDisabled: { opacity: 0.35 },
  cellText: { fontSize: 14, color: "#1B2B33", fontWeight: "700" },
  cellTextSel: { color: "#fff", fontWeight: "800" },
  cellTextDisabled: { color: "#8895A0" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  clear: { color: "#C2571A", fontWeight: "700", fontSize: 14, paddingVertical: 6, paddingHorizontal: 8 },
  todayBtn: { backgroundColor: "#EFF5F7", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  todayText: { color: "#0B6E8F", fontWeight: "700" },
});
