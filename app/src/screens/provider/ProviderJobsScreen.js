import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import ScreenHeader from "../../components/ScreenHeader";
import TextInput from "../../components/AppTextInput";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { body, head } from "../../lib/type";

export default function ProviderJobsScreen() {
  const { logout } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [me, setMe] = useState(null);
  const [otp, setOtp] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.providerJobs();
      setJobs(res.jobs || []);
      setMe(res.provider || null);
    } catch (e) {
      Alert.alert("Jobs", e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 5000);
      return () => clearInterval(timer);
    }, [load])
  );

  const act = async (fn) => {
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert("Could not update", e.message);
    }
  };

  const offers = jobs.filter((j) => j.status === "offered");
  const active = jobs.filter((j) => j.status === "accepted" || j.status === "started");
  const done = jobs.filter((j) => j.status === "completed");

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="briefcase"
        title="Your jobs"
        subtitle={me ? `${me.name} · ${me.phone}` : "Professional login"}
        right={
          <TouchableOpacity onPress={logout}>
            <Text style={styles.logout}>Logout</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={styles.note}>
          A new job is offered to you alone for 60 seconds. Accept it, or it moves to the next free professional. Ask the resident for their 4-digit OTP before you start.
        </Text>
        <Text style={styles.h}>Offers</Text>
        {offers.length === 0 ? <Text style={styles.empty}>No offer right now.</Text> : null}
        {offers.map((job) => (
          <View key={job.id} style={styles.card}>
            <Text style={styles.title}>{job.serviceName}</Text>
            <Text style={styles.meta}>{job.packageName} · {job.scheduledDate} · {job.slot}</Text>
            <Text style={styles.meta}>{job.residentName}{job.flatNo ? ` · Flat ${job.flatNo}` : ""}{job.societyName ? ` · ${job.societyName}` : ""}</Text>
            <Text style={styles.timer}>{job.secondsLeft}s left to accept</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.primary} onPress={() => act(() => api.providerAccept(job.id))}>
                <Text style={styles.primaryText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghost} onPress={() => act(() => api.providerDecline(job.id))}>
                <Text style={styles.ghostText}>Pass</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={styles.h}>Accepted</Text>
        {active.length === 0 ? <Text style={styles.empty}>Nothing in progress.</Text> : null}
        {active.map((job) => (
          <View key={job.id} style={styles.card}>
            <Text style={styles.title}>{job.serviceName}</Text>
            <Text style={styles.meta}>{job.packageName} · {job.scheduledDate} · {job.slot}</Text>
            <Text style={styles.meta}>{job.residentName}{job.flatNo ? ` · Flat ${job.flatNo}` : ""} · {job.status}</Text>
            {job.status === "accepted" ? (
              <View style={styles.row}>
                <TextInput
                  style={styles.otp}
                  value={otp[job.id] || ""}
                  onChangeText={(v) => setOtp((s) => ({ ...s, [job.id]: v.replace(/\D/g, "").slice(0, 4) }))}
                  keyboardType="number-pad"
                  placeholder="Resident OTP"
                  maxLength={4}
                />
                <TouchableOpacity style={styles.primary} onPress={() => act(() => api.providerStart(job.id, otp[job.id]))}>
                  <Text style={styles.primaryText}>Start</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.primary} onPress={() => act(() => api.providerComplete(job.id))}>
                <Text style={styles.primaryText}>Mark complete</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <Text style={styles.h}>History</Text>
        {done.length === 0 ? <Text style={styles.empty}>Completed visits show up here.</Text> : null}
        {done.map((job) => (
          <View key={job.id} style={styles.card}>
            <Text style={styles.title}>{job.serviceName}</Text>
            <Text style={styles.meta}>{job.scheduledDate} · {job.slot}{job.rating ? ` · ${job.rating}★` : ""}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  logout: { color: "#fff", ...body(700) },
  note: { color: "#5C6B73", ...body(400), fontSize: 13, lineHeight: 18, marginBottom: 8 },
  h: { ...head(700), color: "#1B2B33", marginTop: 16, marginBottom: 8 },
  empty: { color: "#8895A0", ...body(400) },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { ...head(700), color: "#1B2B33", fontSize: 16 },
  meta: { color: "#5C6B73", ...body(400), marginTop: 4 },
  timer: { color: "#C2571A", ...body(700), marginTop: 8 },
  row: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  primary: { backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  primaryText: { color: "#fff", ...body(700) },
  ghost: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  ghostText: { color: "#1B2B33", ...body(700) },
  otp: { flex: 1, borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fff" },
});
