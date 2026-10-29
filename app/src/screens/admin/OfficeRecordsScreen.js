import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import TextInput from "../../components/AppTextInput";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import ScreenHeader from "../../components/ScreenHeader";

const thisMonth = () => new Date().toISOString().slice(0, 7);

function saveText(filename, text, mime) {
  if (typeof document === "undefined") return false;
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

function tell(title, message) {
  const text = message ? `${title}\n\n${message}` : title;
  if (typeof window !== "undefined" && window.alert) window.alert(text);
  else Alert.alert(title, message);
}

export default function OfficeRecordsScreen({ navigation }) {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [buildings, setBuildings] = useState([]);
  const [buildingName, setBuildingName] = useState("");
  const [kind, setKind] = useState("residential");
  const [requests, setRequests] = useState([]);
  const [archive, setArchive] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [docTitle, setDocTitle] = useState("");
  const [docBody, setDocBody] = useState("");
  const [polls, setPolls] = useState([]);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("Yes, No");
  const [mails, setMails] = useState([]);
  const [subject, setSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [helpers, setHelpers] = useState(null);
  const [gate, setGate] = useState(null);
  const [month, setMonth] = useState(thisMonth());
  const [moveKind, setMoveKind] = useState("move_in");
  const [moveNote, setMoveNote] = useState("");

  const load = useCallback(async () => {
    try {
      const jobs = [api.societyDocuments(), api.polls(), api.moveRequests()];
      if (admin) jobs.push(api.buildings(), api.memberArchive(), api.groupMails(), api.helperDuplicates());
      const [docs, pollRes, moves, bld, arch, mail, help] = await Promise.all(jobs);
      setDocuments(docs.documents || []);
      setPolls(pollRes.polls || []);
      setRequests(moves.requests || []);
      if (admin) {
        setBuildings(bld?.buildings || []);
        setArchive(arch?.archive || []);
        setMails(mail?.mails || []);
        setHelpers(help || null);
      }
    } catch (e) {
      tell("Records", e.message);
    }
  }, [admin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addBuilding = async () => {
    try {
      await api.addBuilding({ name: buildingName, kind });
      setBuildingName("");
      load();
    } catch (e) {
      tell("Building", e.message);
    }
  };

  const askMove = async () => {
    try {
      await api.askMove({ kind: moveKind, note: moveNote });
      setMoveNote("");
      tell("Move", "The office has your request.");
      load();
    } catch (e) {
      tell("Move", e.message);
    }
  };

  const addDoc = async () => {
    try {
      await api.addDocument({ title: docTitle, body: docBody });
      setDocTitle("");
      setDocBody("");
      load();
    } catch (e) {
      tell("Document", e.message);
    }
  };

  const addPoll = async () => {
    try {
      await api.addPoll({ question, options });
      setQuestion("");
      load();
    } catch (e) {
      tell("Poll", e.message);
    }
  };

  const sendMail = async () => {
    try {
      const res = await api.sendGroupMail({ subject, body: mailBody, audience });
      const m = res.mail;
      tell("Email", `Delivered ${m.sent}, logged without a mail service ${m.dev}, failed ${m.failed}.`);
      setSubject("");
      setMailBody("");
      load();
    } catch (e) {
      tell("Email", e.message);
    }
  };

  const loadGate = async () => {
    try {
      setGate(await api.gateReport(month));
    } catch (e) {
      tell("Gate", e.message);
    }
  };

  const gateFile = async () => {
    try {
      const csv = await api.gateCsv(month);
      if (!saveText(`entry-exit-${month}.csv`, csv, "text/csv")) tell("Gate", csv.slice(0, 400));
    } catch (e) {
      tell("Gate", e.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader icon="file-tray-full" title="Office records" subtitle="Buildings, notices, gate" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body}>
        {admin ? (
          <>
            <Text style={styles.section}>Buildings</Text>
            {buildings.map((b) => (
              <Text key={b.id} style={styles.line}>{b.name} · {b.kind.replace("_", " ")}</Text>
            ))}
            <TextInput style={styles.input} value={buildingName} onChangeText={setBuildingName} placeholder="Building name" />
            <View style={styles.row}>
              {["residential", "non_member", "security", "facilities"].map((k) => (
                <TouchableOpacity key={k} style={[styles.chip, kind === k && styles.chipOn]} onPress={() => setKind(k)}>
                  <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>{k.replace("_", " ")}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Btn label="Add building" onPress={addBuilding} />
          </>
        ) : null}

        <Text style={styles.section}>Move in / move out</Text>
        <View style={styles.row}>
          {["move_in", "move_out"].map((k) => (
            <TouchableOpacity key={k} style={[styles.chip, moveKind === k && styles.chipOn]} onPress={() => setMoveKind(k)}>
              <Text style={[styles.chipText, moveKind === k && styles.chipTextOn]}>{k === "move_in" ? "Move in" : "Move out"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} value={moveNote} onChangeText={setMoveNote} placeholder="Note for the office" />
        <Btn label="Send request" onPress={askMove} />
        {requests.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.cardTitle}>{r.kind === "move_out" ? "Move out" : "Move in"} · {r.status}</Text>
            {r.note ? <Text style={styles.meta}>{r.note}</Text> : null}
            {admin && r.status === "pending" ? (
              <View style={styles.row}>
                <Btn label="Approve" onPress={() => api.decideMove(r.id, "approved").then(load).catch((e) => tell("Move", e.message))} />
                <Btn label="Reject" onPress={() => api.decideMove(r.id, "rejected").then(load).catch((e) => tell("Move", e.message))} />
              </View>
            ) : null}
          </View>
        ))}

        {admin ? (
          <>
            <Text style={styles.section}>Removed and rejected members</Text>
            {archive.length === 0 ? <Text style={styles.meta}>No archived members yet.</Text> : null}
            {archive.map((a) => (
              <Text key={a.id} style={styles.line}>{a.name} · {a.reason}{a.flatNo ? ` · ${a.flatNo}` : ""}</Text>
            ))}
          </>
        ) : null}

        <Text style={styles.section}>Document library</Text>
        {documents.map((d) => (
          <View key={d.id} style={styles.card}>
            <Text style={styles.cardTitle}>{d.title}</Text>
            <Text style={styles.meta}>{d.body}</Text>
          </View>
        ))}
        {admin ? (
          <>
            <TextInput style={styles.input} value={docTitle} onChangeText={setDocTitle} placeholder="Document title" />
            <TextInput style={styles.input} value={docBody} onChangeText={setDocBody} placeholder="Text of the document" />
            <Btn label="Save document" onPress={addDoc} />
          </>
        ) : null}

        <Text style={styles.section}>Polls</Text>
        {polls.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.cardTitle}>{p.question}</Text>
            <View style={styles.row}>
              {(p.options || []).map((opt) => (
                <TouchableOpacity key={opt} style={[styles.chip, p.mine === opt && styles.chipOn]} onPress={() => api.votePoll(p.id, opt).then(load).catch((e) => tell("Poll", e.message))}>
                  <Text style={[styles.chipText, p.mine === opt && styles.chipTextOn]}>{opt} ({p.counts?.[opt] || 0})</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
        {admin ? (
          <>
            <TextInput style={styles.input} value={question} onChangeText={setQuestion} placeholder="Question" />
            <TextInput style={styles.input} value={options} onChangeText={setOptions} placeholder="Options, separated by commas" />
            <Btn label="Start poll" onPress={addPoll} />
          </>
        ) : null}

        {admin ? (
          <>
            <Text style={styles.section}>Group email</Text>
            <View style={styles.row}>
              {["all", "admins", "defaulters"].map((a) => (
                <TouchableOpacity key={a} style={[styles.chip, audience === a && styles.chipOn]} onPress={() => setAudience(a)}>
                  <Text style={[styles.chipText, audience === a && styles.chipTextOn]}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Subject" />
            <TextInput style={styles.input} value={mailBody} onChangeText={setMailBody} placeholder="Message" />
            <Btn label="Send" onPress={sendMail} />
            {mails.slice(0, 5).map((m) => (
              <Text key={m.id} style={styles.line}>{m.subject} · sent {m.sent} · failed {m.failed} · waiting on mail setup {m.dev}</Text>
            ))}

            <Text style={styles.section}>Daily help</Text>
            <Text style={styles.meta}>Active {(helpers?.active || []).length} · Inactive {(helpers?.inactive || []).length} · Possible duplicates {(helpers?.duplicates || []).length}</Text>
            {(helpers?.duplicates || []).slice(0, 8).map((d, i) => (
              <Text key={i} style={styles.line}>{d.reason}: {d.name} and {d.other}</Text>
            ))}
            <Btn label="Open helper list" onPress={() => navigation.navigate("Community", { screen: "Workers" })} />

            <Text style={styles.section}>Gate reports</Text>
            <TextInput style={styles.input} value={month} onChangeText={setMonth} placeholder="YYYY-MM" />
            <Btn label="Who is inside, and empty flats" onPress={loadGate} />
            {gate ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{gate.inside?.length || 0} still inside</Text>
                {(gate.inside || []).slice(0, 8).map((v, i) => (
                  <Text key={i} style={styles.meta}>{v.name} · {v.flatNo} · {v.purpose}</Text>
                ))}
                <Text style={styles.cardTitle}>{(gate.emptyFlat || []).length} visits to a flat with no resident</Text>
                {(gate.emptyFlat || []).slice(0, 6).map((v, i) => (
                  <Text key={i} style={styles.meta}>{v.name} · {v.flatNo}</Text>
                ))}
              </View>
            ) : null}
            <Btn label="Download monthly entry–exit" onPress={gateFile} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Btn({ label, onPress }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F8" },
  body: { padding: 16, paddingBottom: 48 },
  section: { marginTop: 18, marginBottom: 8, fontSize: 15, fontWeight: "700", color: "#14323C" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTitle: { fontWeight: "700", color: "#14323C" },
  meta: { color: "#5C6E76", marginTop: 4, fontSize: 13 },
  line: { color: "#14323C", marginBottom: 6 },
  input: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { backgroundColor: "#E7F2F6", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: "#0B6E8F" },
  chipText: { color: "#0B6E8F", fontSize: 12, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  btn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, alignItems: "center", marginBottom: 8 },
  btnText: { color: "#fff", fontWeight: "700" },
});
