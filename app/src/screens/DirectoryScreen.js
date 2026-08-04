import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Linking,
} from "react-native";
import TextInput from "../components/AppTextInput";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import ScreenHeader from "../components/ScreenHeader";

const initials = (name) =>
  String(name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const cleanPhone = (p) => String(p || "").replace(/[^\d+]/g, "");

export default function DirectoryScreen() {
  const navigation = useNavigation();
  const [residents, setResidents] = useState([]);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { residents } = await api.directoryResidents();
      setResidents(residents || []);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.flatNo?.toLowerCase().includes(q) ||
        r.block?.toLowerCase().includes(q)
    );
  }, [residents, query]);

  const call = (phone) => Linking.openURL(`tel:${cleanPhone(phone)}`).catch(() => {});
  const whatsapp = (phone) =>
    Linking.openURL(`https://wa.me/${cleanPhone(phone).replace(/^\+/, "")}`).catch(() =>
      Alert.alert("WhatsApp unavailable", "Couldn't open WhatsApp for this number.")
    );

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="people"
        title="Member directory"
        subtitle="Reach a neighbour in your society"
        onBack={() => navigation.goBack()}
      />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#8895A0" />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or flat"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={30} color="#B7C2C9" />
            <Text style={styles.emptyText}>No residents found.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(item.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.name}
                {item.isSelf ? " (you)" : ""}
              </Text>
              <Text style={styles.sub}>
                {item.flatNo || "—"}
                {item.block ? ` · Block ${item.block}` : ""}
                {item.phone ? ` · ${item.phone}` : " · number hidden"}
              </Text>
            </View>
            {item.phone && !item.isSelf ? (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => call(item.phone)}>
                  <Ionicons name="call" size={18} color="#0B6E8F" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => whatsapp(item.phone)}>
                  <Ionicons name="logo-whatsapp" size={18} color="#25A366" />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  search: { flex: 1, paddingVertical: 12, fontSize: 15 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#0B6E8F", fontWeight: "800", fontSize: 15 },
  name: { fontSize: 15, fontWeight: "700", color: "#1B2B33" },
  sub: { color: "#6B7B85", fontSize: 12.5, marginTop: 2 },
  actions: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#F1F6F8", alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { color: "#8895A0", fontSize: 14, fontWeight: "600" },
});
