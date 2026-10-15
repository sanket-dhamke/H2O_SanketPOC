import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import ScreenHeader from "../../components/ScreenHeader";
import TextInput from "../../components/AppTextInput";
import { api } from "../../lib/api";
import { brand } from "../../lib/brand";
import { body, head } from "../../lib/type";

export default function ProviderJobsScreen() {
  const [jobs, setJobs] = useState([]);
  const [me, setMe] = useState(null);
  const [otp, setOtp] = useState({});
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.providerJobs();
      setJobs(res.jobs || []);
      setMe(res.provider || null);
      setNotice("");
    } catch (e) {
      setNotice(e.message);
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
      setNotice(e.message);
    }
  };

  const offers = jobs.filter((j) => j.status === "offered");
  const active = jobs.filter((j) => j.status === "accepted" || j.status === "started");
  const done = jobs.filter((j) => j.status === "completed");
  const desk = me?.fallback;

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="briefcase"
        title={`${brand.name} jobs`}
        subtitle={me ? `${me.name} · ${me.phone}` : "Service professional"}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.intro}>
          <Text style={styles.introTitle}>{desk ? "You are the GATEZO house desk" : "You are a GATEZO service professional"}</Text>
          <Text style={styles.introBody}>
            {desk
              ? "A visit comes to you only after every other free professional has passed the 60-second offer. You do not pay the annual pack. Open Guide for the full steps."
              : "Open Hours to choose when you take visits. A resident books one of those times. The visit is offered to you alone for 60 seconds. Accept it, take the resident’s start code, do the work, then take their finish code. Open Guide if this is your first day."}
          </Text>
          {me && !desk ? (
            <Text style={styles.introMeta}>
              {me.packActive
                ? `Annual pack is paid${me.lastPayment ? ` (₹${Number(me.lastPayment.amount).toLocaleString("en-IN")} on ${me.lastPayment.paidOn})` : ""}. Valid until ${String(me.packPaidUntil || "").slice(0, 10)}. You can receive jobs.`
                : `Annual pack is not recorded. You can log in, but GATEZO will not send you visits until the owner records ₹${Number(me.packAmount || 0).toLocaleString("en-IN")}.`}
            </Text>
          ) : null}
        </View>
        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        <Text style={styles.h}>New offers</Text>
        {offers.length === 0 ? <Text style={styles.empty}>No offer right now. Leave this screen open. A new visit appears here for 60 seconds.</Text> : null}
        {offers.map((job) => (
          <View key={job.id} style={styles.card}>
            <Text style={styles.title}>{job.serviceName}</Text>
            <Text style={styles.meta}>{job.packageName}</Text>
            <Text style={styles.meta}>{job.scheduledDate} · {job.slot}</Text>
            <Text style={styles.meta}>{job.residentName}{job.flatNo ? ` · Flat ${job.flatNo}` : ""}{job.societyName ? ` · ${job.societyName}` : ""}</Text>
            <Text style={styles.timer}>{job.secondsLeft}s left. If you pass, it goes to the next professional.</Text>
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

        <Text style={styles.h}>Today’s visits</Text>
        {active.length === 0 ? <Text style={styles.empty}>Nothing in progress.</Text> : null}
        {active.map((job) => (
          <View key={job.id} style={styles.card}>
            <Text style={styles.title}>{job.serviceName}</Text>
            <Text style={styles.meta}>{job.packageName} · {job.scheduledDate} · {job.slot}</Text>
            <Text style={styles.meta}>{job.residentName}{job.flatNo ? ` · Flat ${job.flatNo}` : ""}</Text>
            {job.status === "accepted" ? (
              <>
                <Text style={styles.step}>Step 1. Ask the resident for the 4-digit start code on their booking. Work begins only after it matches.</Text>
                <View style={styles.row}>
                  <TextInput
                    style={styles.otp}
                    value={otp[job.id] || ""}
                    onChangeText={(v) => setOtp((s) => ({ ...s, [job.id]: v.replace(/\D/g, "").slice(0, 4) }))}
                    keyboardType="number-pad"
                    placeholder="Start code"
                    maxLength={4}
                  />
                  <TouchableOpacity style={styles.primary} onPress={() => act(() => api.providerStart(job.id, otp[job.id]))}>
                    <Text style={styles.primaryText}>Start work</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.step}>Step 2. When the work is finished, ask the resident for the finish code. They see it only after the visit has started.</Text>
                <View style={styles.row}>
                  <TextInput
                    style={styles.otp}
                    value={otp[`${job.id}-done`] || ""}
                    onChangeText={(v) => setOtp((s) => ({ ...s, [`${job.id}-done`]: v.replace(/\D/g, "").slice(0, 4) }))}
                    keyboardType="number-pad"
                    placeholder="Finish code"
                    maxLength={4}
                  />
                  <TouchableOpacity style={styles.primary} onPress={() => act(() => api.providerComplete(job.id, otp[`${job.id}-done`]))}>
                    <Text style={styles.primaryText}>Mark done</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        ))}

        <Text style={styles.h}>Finished</Text>
        {done.length === 0 ? <Text style={styles.empty}>Completed visits show up here with the resident’s rating.</Text> : null}
        {done.map((job) => (
          <View key={job.id} style={styles.card}>
            <Text style={styles.title}>{job.serviceName}</Text>
            <Text style={styles.meta}>{job.scheduledDate} · {job.slot}{job.rating ? ` · ${job.rating}★` : " · waiting for a rating"}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  intro: { backgroundColor: "#EAF4F7", borderRadius: 12, padding: 14, marginBottom: 8 },
  introTitle: { ...head(700), color: "#0B6E8F", fontSize: 16 },
  introBody: { color: "#1B2B33", ...body(400), marginTop: 6, lineHeight: 20 },
  introMeta: { color: "#0B6E8F", ...body(700), marginTop: 8, lineHeight: 20 },
  notice: { backgroundColor: "#FDECEC", color: "#8A1F18", borderRadius: 10, padding: 12, marginTop: 8, ...body(700) },
  h: { ...head(700), color: "#1B2B33", marginTop: 16, marginBottom: 8 },
  empty: { color: "#5C6B73", ...body(400), lineHeight: 20 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { ...head(700), color: "#1B2B33", fontSize: 16 },
  meta: { color: "#5C6B73", ...body(400), marginTop: 4 },
  step: { color: "#1B2B33", ...body(400), marginTop: 8, lineHeight: 20 },
  timer: { color: "#C2571A", ...body(700), marginTop: 8 },
  row: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  primary: { backgroundColor: "#0B6E8F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  primaryText: { color: "#fff", ...body(700) },
  ghost: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  ghostText: { color: "#1B2B33", ...body(700) },
  otp: { flex: 1, borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fff" },
});
