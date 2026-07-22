import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";

const CSV_TEMPLATE = `flatNo,block,ownerName,ownerEmail,ownerPhone
A-101,A,Ravi Kumar,ravi@example.com,9876543210
A-102,A,Sneha Rao,sneha@example.com,9876500000
B-201,B,Imran Shaikh,,9812345678`;

export default function OnboardingScreen({ navigation }) {
  const [tab, setTab] = useState("generate");

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="construct"
        title="Bulk setup"
        subtitle="Generate or import flats & residents"
        onBack={() => navigation.goBack()}
      />
      <View style={styles.tabs}>
        <TabBtn label="Generate structure" active={tab === "generate"} onPress={() => setTab("generate")} />
        <TabBtn label="Import CSV" active={tab === "csv"} onPress={() => setTab("csv")} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {tab === "generate" ? <GenerateForm /> : <CsvForm />}
      </ScrollView>
    </View>
  );
}

function GenerateForm() {
  const [wings, setWings] = useState("A,B");
  const [floors, setFloors] = useState("5");
  const [flatsPerFloor, setFlatsPerFloor] = useState("4");
  const [startFloor, setStartFloor] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const total =
    (wings.split(",").filter((w) => w.trim()).length || 1) *
    (Number(floors) || 0) *
    (Number(flatsPerFloor) || 0);

  const submit = async () => {
    if (!Number(floors) || !Number(flatsPerFloor)) {
      Alert.alert("Missing info", "Enter floors and flats per floor.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api.adminGenerateFlats({
        wings,
        floors: Number(floors),
        flatsPerFloor: Number(flatsPerFloor),
        startFloor: Number(startFloor) || 1,
      });
      setResult(r);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.infoCard}>
        <Ionicons name="bulb-outline" size={18} color="#0B6E8F" />
        <Text style={styles.infoText}>
          Quickly create the whole society layout. Flats are named like{" "}
          <Text style={{ fontWeight: "800" }}>A-101, A-102 … B-201</Text> (block = wing, floor +
          unit). You can edit or add owners later.
        </Text>
      </View>

      <Label>Wings / blocks (comma separated)</Label>
      <TextInput style={styles.input} value={wings} onChangeText={setWings} placeholder="A,B,C,D" autoCapitalize="characters" />
      <Text style={styles.hint}>Leave blank for a single unnamed wing (flats 101, 102 …).</Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Label>Floors per wing</Label>
          <TextInput style={styles.input} value={floors} onChangeText={setFloors} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Flats per floor</Label>
          <TextInput style={styles.input} value={flatsPerFloor} onChangeText={setFlatsPerFloor} keyboardType="number-pad" />
        </View>
        <View style={{ width: 90 }}>
          <Label>Start floor</Label>
          <TextInput style={styles.input} value={startFloor} onChangeText={setStartFloor} keyboardType="number-pad" />
        </View>
      </View>

      <Text style={styles.total}>Will create up to {total || 0} flats</Text>

      <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        <Ionicons name="grid-outline" size={18} color="#fff" />
        <Text style={styles.primaryText}>{busy ? "Generating…" : "Generate flats"}</Text>
      </TouchableOpacity>

      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Done ✔</Text>
          <Text style={styles.resultLine}>Created: {result.created} flats</Text>
          {result.skipped > 0 && <Text style={styles.resultLine}>Skipped (already existed): {result.skipped}</Text>}
          {!!result.sample?.length && <Text style={styles.resultLine}>e.g. {result.sample.join(", ")}</Text>}
        </View>
      )}
    </>
  );
}

function CsvForm() {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!csv.trim()) {
      Alert.alert("Paste CSV", "Paste your CSV data first (or tap 'Use template').");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api.adminImportFlats({ csv });
      setResult(r);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.infoCard}>
        <Ionicons name="document-text-outline" size={18} color="#0B6E8F" />
        <Text style={styles.infoText}>
          Migrating from another app? Export your members to a spreadsheet, then paste as CSV.
          Header row: <Text style={{ fontWeight: "800" }}>flatNo, block, ownerName, ownerEmail, ownerPhone</Text>.
          Rows with an email also get a resident login (a temporary password is generated & shown here).
        </Text>
      </View>

      <View style={styles.csvHeadRow}>
        <Label>CSV data</Label>
        <TouchableOpacity onPress={() => setCsv(CSV_TEMPLATE)}>
          <Text style={styles.templateLink}>Use template</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.csvInput}
        value={csv}
        onChangeText={setCsv}
        placeholder={CSV_TEMPLATE}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
        <Text style={styles.primaryText}>{busy ? "Importing…" : "Import"}</Text>
      </TouchableOpacity>

      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Import complete</Text>
          <Text style={styles.resultLine}>Flats created: {result.flatsCreated}</Text>
          <Text style={styles.resultLine}>Flats skipped (existing): {result.flatsSkipped}</Text>
          <Text style={styles.resultLine}>Resident logins created: {result.residentsCreated}</Text>
          {!!result.credentials?.length && (
            <>
              <Text style={[styles.resultTitle, { marginTop: 12 }]}>Temporary passwords</Text>
              <Text style={styles.hint}>Share securely — residents can change these after first login.</Text>
              {result.credentials.map((c) => (
                <Text key={c.email} style={styles.cred}>
                  {c.flatNo} · {c.email} → {c.tempPassword || "(password you provided)"}
                </Text>
              ))}
            </>
          )}
          {!!result.errors?.length && (
            <>
              <Text style={[styles.resultTitle, { marginTop: 12, color: "#C2571A" }]}>Notices</Text>
              {result.errors.map((e, i) => (
                <Text key={i} style={styles.errLine}>• {e}</Text>
              ))}
            </>
          )}
        </View>
      )}
    </>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

function TabBtn({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && { color: "#0B6E8F" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  tabs: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E6EDF0" },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
  tabBtnActive: { borderBottomColor: "#0B6E8F" },
  tabText: { fontWeight: "700", color: "#93A2AB" },
  infoCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: "#EAF4F7", borderRadius: 12, padding: 14, marginBottom: 16 },
  infoText: { flex: 1, color: "#3C5560", fontSize: 13, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "700", color: "#334", marginBottom: 6, marginTop: 12 },
  hint: { color: "#8895A0", fontSize: 12, marginTop: 4 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#fff" },
  row: { flexDirection: "row", gap: 10 },
  total: { color: "#0B6E8F", fontWeight: "800", marginTop: 14, textAlign: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingVertical: 14, marginTop: 16 },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  csvHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  templateLink: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  csvInput: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, padding: 12, fontSize: 13, backgroundColor: "#fff", minHeight: 160, textAlignVertical: "top", fontFamily: "monospace" },
  resultCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginTop: 18 },
  resultTitle: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  resultLine: { color: "#3C5560", marginTop: 4 },
  cred: { color: "#1B2B33", marginTop: 6, fontSize: 13, fontFamily: "monospace" },
  errLine: { color: "#C2571A", marginTop: 4, fontSize: 12 },
});
