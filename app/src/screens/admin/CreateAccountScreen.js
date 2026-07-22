import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor, isPreschool } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";

export default function CreateAccountScreen({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const preschool = isPreschool(user);
  // Parents (preschool) and residents (society) are the same underlying role;
  // just labeled per tenant. Both are linked to a unit/student.
  const ROLES = [
    { id: "resident", label: L.payer },
    { id: "guard", label: "Guard" },
    { id: "admin", label: "Admin" },
  ];
  const [role, setRole] = useState("resident");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [flats, setFlats] = useState([]);
  const [flatId, setFlatId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .adminListFlats()
      .then(({ flats }) => setFlats(flats))
      .catch(() => {});
  }, []);

  const submit = async () => {
    setError("");
    if (!name.trim() || !email.trim() || !password) {
      setError("Name, email and password are required.");
      return;
    }
    if (role === "resident" && !flatId) {
      setError(`Please select a ${L.unit.toLowerCase()} for the ${L.payer.toLowerCase()}.`);
      return;
    }
    setBusy(true);
    try {
      await api.adminCreateUser({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
        flatId: role === "resident" ? flatId : undefined,
      });
      Alert.alert("Account created", `${name} can now log in.`);
      navigation.goBack();
    } catch (e) {
      // Surfaces the backend's exact reason, e.g. the password policy message.
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader icon="person-add" title="New account" subtitle={`Add a ${L.payer.toLowerCase()}, guard or admin`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <Text style={styles.label}>Role</Text>
      <View style={styles.chips}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={[styles.chip, role === r.id && styles.chipActive]}
            onPress={() => setRole(r.id)}
          >
            <Text style={[styles.chipText, role === r.id && styles.chipTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Full name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Aarav Sharma" />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder={preschool ? "user@preschool.com" : "user@society.com"}
      />

      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Optional" />

      <Text style={styles.label}>Temporary password</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Min 8 chars, upper, lower, number" />
      <Text style={styles.hint}>Must be 8+ chars with an uppercase, lowercase and a number.</Text>

      {role === "resident" && (
        <>
          <Text style={styles.label}>{L.unit}</Text>
          <View style={styles.chips}>
            {flats.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.chip, flatId === f.id && styles.chipActive]}
                onPress={() => setFlatId(f.id)}
              >
                <Text style={[styles.chipText, flatId === f.id && styles.chipTextActive]}>{f.flatNo}</Text>
              </TouchableOpacity>
            ))}
            {flats.length === 0 && <Text style={styles.hint}>No {L.units.toLowerCase()} yet. Add one under {L.units}.</Text>}
          </View>
        </>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Creating..." : "Create account"}</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  title: { fontSize: 22, fontWeight: "800", color: "#1B2B33", marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#fff" },
  hint: { color: "#8895A0", fontSize: 12, marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#D6DEE3" },
  chipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  chipText: { color: "#334", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  error: { color: "#C0392B", backgroundColor: "#FBE7E4", padding: 12, borderRadius: 10, marginTop: 20, fontSize: 13, fontWeight: "600" },
  button: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
