import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import TextInput from "../../components/AppTextInput";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";
import KeyboardAwareScrollView from "../../components/KeyboardAwareScrollView";

const CSV_TEMPLATE = `flatNo,block,ownerName,ownerEmail,ownerPhone
A-101,A,Ravi Kumar,ravi@example.com,9876543210
A-102,A,Sneha Rao,sneha@example.com,9876500000
B-201,B,Imran Shaikh,,9812345678`;

export default function OnboardingScreen({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const [tab, setTab] = useState("generate");

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="construct"
        title="Bulk setup"
        subtitle={`Generate or import ${L.units.toLowerCase()} & ${L.payers.toLowerCase()}`}
        onBack={() => navigation.goBack()}
      />
      <View style={styles.tabs}>
        <TabBtn label="Generate structure" active={tab === "generate"} onPress={() => setTab("generate")} />
        <TabBtn label="Import CSV" active={tab === "csv"} onPress={() => setTab("csv")} />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16 }}>
        {tab === "generate" ? <GenerateForm /> : <CsvForm />}
      </KeyboardAwareScrollView>
    </View>
  );
}

// Soft cap on how many flats we render as individually-editable rows. Above this
// we still let the admin create everything (they can fine-tune later in Manage
// flats), we just skip the heavy per-flat inputs to keep the screen snappy.
const EDIT_LIMIT = 600;

// Mirror the flat-numbering used server-side: floor + zero-padded unit,
// prefixed with the wing (e.g. floor 1, unit 1, wing A -> "A-101").
function buildFlatNo(block, floor, unit) {
  const u = `${floor}${String(unit).padStart(2, "0")}`;
  return block ? `${block}-${u}` : u;
}

function GenerateForm() {
  const [step, setStep] = useState("form"); // "form" | "preview"
  const [wings, setWings] = useState("A,B");
  const [floors, setFloors] = useState("5");
  const [flatsPerFloor, setFlatsPerFloor] = useState("4");
  const [startFloor, setStartFloor] = useState("1");
  const [startUnit, setStartUnit] = useState("1");
  const [rows, setRows] = useState([]); // [{ key, block, floor, flatNo }]
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const keyRef = useRef(0);
  const nextKey = () => `k${keyRef.current++}`;

  const wingList = wings.split(",").map((w) => w.trim()).filter(Boolean);
  const total =
    (wingList.length || 1) * (Number(floors) || 0) * (Number(flatsPerFloor) || 0);

  const buildPreview = () => {
    const nFloors = Number(floors);
    const nPerFloor = Number(flatsPerFloor);
    const fStart = Number(startFloor) || 1;
    const uStart = Number(startUnit) || 1;
    if (!nFloors || !nPerFloor || nFloors < 1 || nPerFloor < 1) {
      Alert.alert("Missing info", "Enter floors and flats per floor (at least 1 each).");
      return;
    }
    if (total > 3000) {
      Alert.alert("Too many", `That would create ${total} flats. Please keep it under 3000.`);
      return;
    }
    const list = [];
    const blocks = wingList.length ? wingList : [""];
    for (const w of blocks) {
      for (let fl = fStart; fl < fStart + nFloors; fl++) {
        for (let u = uStart; u < uStart + nPerFloor; u++) {
          list.push({ key: nextKey(), block: w || "", floor: fl, flatNo: buildFlatNo(w, fl, u) });
        }
      }
    }
    setRows(list);
    setResult(null);
    setStep("preview");
  };

  const editRow = (key, flatNo) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, flatNo } : r)));
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
  const addRow = (block, floor) =>
    setRows((rs) => {
      // Insert after the last row of this wing+floor so it stays grouped.
      const idx = rs.map((r, i) => ({ r, i })).filter(({ r }) => r.block === block && r.floor === floor).pop();
      const newRow = { key: nextKey(), block, floor, flatNo: buildFlatNo(block, floor, "") };
      if (!idx) return [...rs, newRow];
      const copy = [...rs];
      copy.splice(idx.i + 1, 0, newRow);
      return copy;
    });

  // Group rows for display: [{ block, floors: [{ floor, items: [row] }] }]
  const groups = useMemo(() => {
    const byBlock = new Map();
    for (const r of rows) {
      if (!byBlock.has(r.block)) byBlock.set(r.block, new Map());
      const fl = byBlock.get(r.block);
      if (!fl.has(r.floor)) fl.set(r.floor, []);
      fl.get(r.floor).push(r);
    }
    return [...byBlock.entries()].map(([block, floorsMap]) => ({
      block,
      floors: [...floorsMap.entries()].map(([floor, items]) => ({ floor, items })),
    }));
  }, [rows]);

  const validCount = rows.filter((r) => r.flatNo.trim()).length;

  const create = async () => {
    const flats = rows
      .map((r) => ({ flatNo: r.flatNo.trim(), block: r.block || null }))
      .filter((f) => f.flatNo);
    if (flats.length === 0) {
      Alert.alert("Nothing to create", "Add at least one flat.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api.adminBulkCreateFlats({ flats });
      setResult(r);
      setStep("form");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  if (step === "preview") {
    return (
      <>
        <View style={styles.previewBar}>
          <TouchableOpacity style={styles.linkBtn} onPress={() => setStep("form")}>
            <Ionicons name="chevron-back" size={16} color="#0B6E8F" />
            <Text style={styles.linkText}>Edit settings</Text>
          </TouchableOpacity>
          <Text style={styles.previewCount}>{validCount} flats</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="create-outline" size={18} color="#0B6E8F" />
          <Text style={styles.infoText}>
            Review the layout below. Tap any flat number to rename it, remove flats you don't
            need, or add extra flats to a floor. Then tap <Text style={{ fontWeight: "800" }}>Create</Text>.
          </Text>
        </View>

        {rows.length > EDIT_LIMIT ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultLine}>
              {rows.length} flats is a lot to edit on screen. You can create them now and fine-tune
              individual flats afterwards in <Text style={{ fontWeight: "800" }}>Manage flats</Text>.
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.block || "_"} style={styles.wingCard}>
              <Text style={styles.wingTitle}>{g.block ? `Wing ${g.block}` : "Flats"}</Text>
              {g.floors.map((f) => (
                <View key={`${g.block}-${f.floor}`} style={styles.floorBlock}>
                  <Text style={styles.floorLabel}>Floor {f.floor}</Text>
                  <View style={styles.flatWrap}>
                    {f.items.map((r) => (
                      <View key={r.key} style={styles.flatChip}>
                        <TextInput
                          style={styles.flatInput}
                          value={r.flatNo}
                          onChangeText={(t) => editRow(r.key, t)}
                          autoCapitalize="characters"
                        />
                        <TouchableOpacity onPress={() => removeRow(r.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={18} color="#C25B4A" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={styles.addFlat} onPress={() => addRow(g.block, f.floor)}>
                      <Ionicons name="add" size={16} color="#0B6E8F" />
                      <Text style={styles.addFlatText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}

        <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={create} disabled={busy}>
          <Ionicons name="checkmark-done" size={18} color="#fff" />
          <Text style={styles.primaryText}>{busy ? "Creating…" : `Create ${validCount} flats`}</Text>
        </TouchableOpacity>
      </>
    );
  }

  return (
    <>
      <View style={styles.infoCard}>
        <Ionicons name="bulb-outline" size={18} color="#0B6E8F" />
        <Text style={styles.infoText}>
          Quickly create the whole society layout. Flats are named like{" "}
          <Text style={{ fontWeight: "800" }}>A-101, A-102 … B-201</Text> (block = wing, floor +
          unit). You'll get to review &amp; edit every flat before it's created.
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
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Label>Start floor</Label>
          <TextInput style={styles.input} value={startFloor} onChangeText={setStartFloor} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Flat start no</Label>
          <TextInput style={styles.input} value={startUnit} onChangeText={setStartUnit} keyboardType="number-pad" />
        </View>
      </View>
      <Text style={styles.hint}>
        Example: start floor 1, flat start 1 → 101, 102 … Start floor 1, flat start 5 → 105, 106 …
      </Text>

      <Text style={styles.total}>Will preview up to {total || 0} flats</Text>

      <TouchableOpacity style={styles.primaryBtn} onPress={buildPreview}>
        <Ionicons name="eye-outline" size={18} color="#fff" />
        <Text style={styles.primaryText}>Preview &amp; edit</Text>
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
  previewBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  linkText: { color: "#0B6E8F", fontWeight: "700", fontSize: 14 },
  previewCount: { color: "#0B6E8F", fontWeight: "800", fontSize: 14 },
  wingCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 14 },
  wingTitle: { fontWeight: "800", color: "#1B2B33", fontSize: 15, marginBottom: 8 },
  floorBlock: { marginBottom: 10 },
  floorLabel: { color: "#8895A0", fontWeight: "700", fontSize: 12, marginBottom: 6 },
  flatWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  flatChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F1F5F7", borderRadius: 8, paddingLeft: 8, paddingRight: 6, paddingVertical: 4 },
  flatInput: { minWidth: 58, fontSize: 13, fontWeight: "700", color: "#1B2B33", paddingVertical: 2 },
  addFlat: { flexDirection: "row", alignItems: "center", gap: 2, borderWidth: 1, borderColor: "#B7D4DE", borderStyle: "dashed", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addFlatText: { color: "#0B6E8F", fontWeight: "700", fontSize: 12 },
  resultCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginTop: 18 },
  resultTitle: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  resultLine: { color: "#3C5560", marginTop: 4 },
  cred: { color: "#1B2B33", marginTop: 6, fontSize: 13, fontFamily: "monospace" },
  errLine: { color: "#C2571A", marginTop: 4, fontSize: 12 },
});
