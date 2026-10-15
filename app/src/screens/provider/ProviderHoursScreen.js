import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import ScreenHeader from "../../components/ScreenHeader";
import { api } from "../../lib/api";
import { body, head } from "../../lib/type";

const STARTS = ["08:00", "09:00", "10:00", "11:00"];
const ENDS = ["17:00", "18:00", "19:00", "20:00", "21:00"];
const DAYS = [
  { id: "1", label: "Mon" },
  { id: "2", label: "Tue" },
  { id: "3", label: "Wed" },
  { id: "4", label: "Thu" },
  { id: "5", label: "Fri" },
  { id: "6", label: "Sat" },
  { id: "0", label: "Sun" },
];

export default function ProviderHoursScreen() {
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("20:00");
  const [off, setOff] = useState(["0"]);
  const [desk, setDesk] = useState(false);
  const [notice, setNotice] = useState("");
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    const res = await api.providerJobs();
    const me = res.provider || {};
    setStart(me.workStart || "09:00");
    setEnd(me.workEnd || "20:00");
    setOff(me.offDays || []);
    setDesk(!!me.fallback);
  }, []);

  useFocusEffect(useCallback(() => { load().catch((e) => setNotice(e.message)); }, [load]));

  const toggle = (id) => {
    setOff((days) => (days.includes(id) ? days.filter((d) => d !== id) : [...days, id]));
  };

  const save = async () => {
    setOk(false);
    try {
      await api.providerHours({ workStart: start, workEnd: end, offDays: off });
      setNotice(`Saved. Residents can book you from ${start} to ${end} on the days that are on.`);
      setOk(true);
    } catch (e) {
      setNotice(e.message);
      setOk(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader icon="time" title="Working hours" subtitle="When residents can book you" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.lead}>
          {desk
            ? "The house desk stays available for any slot the catalogue offers. You do not set hours."
            : "This is the same idea as Urban Company. You choose the hours you will take visits. A resident only sees a slot when you, or another professional for that service, are free then."}
        </Text>
        {!!notice && <Text style={[styles.notice, ok && styles.noticeOk]}>{notice}</Text>}
        {!desk ? (
          <>
            <Text style={styles.h}>Start</Text>
            <View style={styles.row}>
              {STARTS.map((t) => (
                <TouchableOpacity key={t} style={[styles.chip, start === t && styles.chipOn]} onPress={() => setStart(t)}>
                  <Text style={[styles.chipText, start === t && styles.chipTextOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.h}>End</Text>
            <View style={styles.row}>
              {ENDS.map((t) => (
                <TouchableOpacity key={t} style={[styles.chip, end === t && styles.chipOn]} onPress={() => setEnd(t)}>
                  <Text style={[styles.chipText, end === t && styles.chipTextOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.h}>Days off</Text>
            <Text style={styles.lead}>Tap a day to mark it off. Off days are not offered to residents.</Text>
            <View style={styles.row}>
              {DAYS.map((d) => {
                const on = off.includes(d.id);
                return (
                  <TouchableOpacity key={d.id} style={[styles.chip, on && styles.off]} onPress={() => toggle(d.id)}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{on ? `${d.label} off` : d.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.primary} onPress={save}>
              <Text style={styles.primaryText}>Save hours</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  lead: { color: "#1B2B33", ...body(400), lineHeight: 20 },
  h: { ...head(700), color: "#1B2B33", marginTop: 16, marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff" },
  chipOn: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  off: { backgroundColor: "#8A1F18", borderColor: "#8A1F18" },
  chipText: { ...body(700), color: "#1B2B33" },
  chipTextOn: { color: "#fff" },
  primary: { marginTop: 18, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  primaryText: { color: "#fff", ...body(700) },
  notice: { backgroundColor: "#FDECEC", color: "#8A1F18", borderRadius: 10, padding: 12, marginTop: 12, ...body(700) },
  noticeOk: { backgroundColor: "#E7F6EE", color: "#0E6B3C" },
});
