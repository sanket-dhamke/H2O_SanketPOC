import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";

export default function ManageFlatsScreen({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const [flats, setFlats] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [flatNo, setFlatNo] = useState("");
  const [block, setBlock] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { flats } = await api.adminListFlats();
      setFlats(flats);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const addFlat = async () => {
    if (!flatNo.trim()) {
      Alert.alert("Missing info", "Flat number is required.");
      return;
    }
    setBusy(true);
    try {
      await api.adminCreateFlat({ flatNo: flatNo.trim(), block: block.trim(), ownerName: ownerName.trim() });
      setFlatNo("");
      setBlock("");
      setOwnerName("");
      await load();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="business"
        title={L.units}
        subtitle={`Add & view ${L.units.toLowerCase()}`}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate("Onboarding")}
            style={styles.bulkBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="construct-outline" size={18} color="#fff" />
            <Text style={styles.bulkText}>Bulk setup</Text>
          </TouchableOpacity>
        }
      />
      <View style={styles.form}>
        <Text style={styles.formTitle}>Add a {L.unit.toLowerCase()}</Text>
        <View style={styles.formRow}>
          <TextInput style={[styles.input, { flex: 1 }]} value={flatNo} onChangeText={setFlatNo} placeholder={L.unit + " no (A-101)"} autoCapitalize="characters" />
          <TextInput style={[styles.input, { width: 80 }]} value={block} onChangeText={setBlock} placeholder={L.wing} autoCapitalize="characters" />
        </View>
        <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName} placeholder="Owner name (optional)" />
        <TouchableOpacity style={[styles.addBtn, busy && { opacity: 0.6 }]} onPress={addFlat} disabled={busy}>
          <Text style={styles.addBtnText}>{busy ? "Adding..." : `Add ${L.unit.toLowerCase()}`}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={flats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>No {L.units.toLowerCase()} yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.flatNo}>{item.flatNo}</Text>
              <Text style={styles.meta}>
                {item.ownerName ? item.ownerName : "No owner set"} · {item.residentCount} resident(s)
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  bulkBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  bulkText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  form: { backgroundColor: "#fff", padding: 16, borderBottomWidth: 1, borderBottomColor: "#E6EDF0" },
  formTitle: { fontSize: 16, fontWeight: "800", color: "#1B2B33", marginBottom: 10 },
  formRow: { flexDirection: "row", gap: 10 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFB", marginBottom: 10 },
  addBtn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  addBtnText: { color: "#fff", fontWeight: "700" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 10 },
  flatNo: { fontSize: 16, fontWeight: "700", color: "#1B2B33" },
  meta: { color: "#6B7B85", marginTop: 2, fontSize: 13 },
  empty: { textAlign: "center", color: "#6B7B85", marginTop: 40 },
});
