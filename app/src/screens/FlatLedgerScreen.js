import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TextInput from "../components/AppTextInput";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS = {
  paid: { label: "Paid", bg: "#DFF3E6", fg: "#1E7A3D" },
  partial: { label: "Partial", bg: "#FDF0D0", fg: "#8A5A00" },
  pending: { label: "Pending", bg: "#FBE4D5", fg: "#9A3412" },
};

// Full per-flat payment audit. Admins see flats in their own society; the GateMate
// owner reaches this per-society (societyId passed via route params). Picking a
// flat loads its COMPLETE history — every bill and every individual payment,
// oldest first — so a miscalculation can be traced back to the beginning.
export default function FlatLedgerScreen({ navigation, route }) {
  const { user } = useAuth();
  const isSuper = user?.role === "superadmin";
  const societyId = route?.params?.societyId || null;
  const societyName = route?.params?.societyName || null;

  // When a flat is passed in (e.g. tapping a unit row on the dashboard) we open
  // straight into its ledger and Back returns to the previous screen.
  const directFlat = route?.params?.flat || null;

  const [flats, setFlats] = useState([]);
  const [loadingFlats, setLoadingFlats] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(directFlat); // { id, flatNo }
  const [ledger, setLedger] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadLedger = useCallback(
    async (flat) => {
      setLedger(null);
      setLoadingLedger(true);
      try {
        const r = isSuper ? await api.superFlatLedger(flat.id) : await api.adminFlatLedger(flat.id);
        setLedger(r.ledger || null);
      } catch {
        setLedger(null);
      } finally {
        setLoadingLedger(false);
      }
    },
    [isSuper]
  );

  // Direct-open a specific flat's ledger (from a tapped unit row).
  useEffect(() => {
    if (directFlat) loadLedger(directFlat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFlats = useCallback(async () => {
    if (directFlat) return; // picker not needed in direct mode
    setLoadingFlats(true);
    try {
      if (isSuper) {
        const r = await api.superSocietyFlats(societyId);
        setFlats(r.flats || []);
      } else {
        const r = await api.adminFinance();
        setFlats((r.perFlat || []).map((f) => ({ id: f.flatId, flatNo: f.flatNo, paid: f.paid, pending: f.pending })));
      }
    } catch {
      setFlats([]);
    } finally {
      setLoadingFlats(false);
    }
  }, [isSuper, societyId]);

  useEffect(() => {
    loadFlats();
  }, [loadFlats]);

  const openFlat = async (flat) => {
    setSelected(flat);
    await loadLedger(flat);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (selected) await loadLedger(selected);
    else await loadFlats();
    setRefreshing(false);
  };

  const goBack = () => {
    // In picker mode, Back from a ledger returns to the flat list; in direct
    // mode (opened for a specific flat) it returns to the previous screen.
    if (selected && !directFlat) {
      setSelected(null);
      setLedger(null);
    } else {
      navigation.goBack();
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? flats.filter((f) => String(f.flatNo || "").toLowerCase().includes(q) || String(f.block || "").toLowerCase().includes(q))
    : flats;

  const headerTitle = selected ? String(selected.flatNo) : "Payment audit";
  const headerSub = selected
    ? "Complete bill & payment history"
    : societyName || "Pick a unit to see its full history";

  return (
    <View style={styles.container}>
      <ScreenHeader icon="receipt-outline" title={headerTitle} subtitle={headerSub} onBack={goBack} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {!selected ? (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color="#6B7B85" />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search unit or block"
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color="#B7C2C9" />
                </TouchableOpacity>
              )}
            </View>

            {loadingFlats ? (
              <ActivityIndicator color="#0B6E8F" style={{ marginTop: 30 }} />
            ) : filtered.length === 0 ? (
              <Text style={styles.empty}>No units found.</Text>
            ) : (
              filtered.map((f) => (
                <TouchableOpacity key={f.id} style={styles.flatRow} onPress={() => openFlat(f)} activeOpacity={0.8}>
                  <View style={styles.flatIcon}>
                    <Ionicons name="home-outline" size={18} color="#0B6E8F" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.flatNo}>{f.flatNo}{f.block ? `  ·  ${f.block}` : ""}</Text>
                    <Text style={styles.flatMeta}>
                      Paid <Text style={{ color: "#2E9E52", fontWeight: "700" }}>{money(f.paid)}</Text>
                      {"   "}Due <Text style={{ color: f.pending > 0 ? "#C2571A" : "#6B7B85", fontWeight: "700" }}>{money(f.pending)}</Text>
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#B7C2C9" />
                </TouchableOpacity>
              ))
            )}
          </>
        ) : loadingLedger ? (
          <ActivityIndicator color="#0B6E8F" style={{ marginTop: 40 }} />
        ) : !ledger ? (
          <Text style={styles.empty}>Couldn't load this unit's history.</Text>
        ) : (
          <>
            <View style={styles.summaryCard}>
              {!!ledger.society && <Text style={styles.summarySociety}>{ledger.society.name}</Text>}
              <View style={styles.summaryGrid}>
                <Summary label="Total billed" value={money(ledger.summary.totalBilled)} color="#1B2B33" />
                <Summary label="Collected" value={money(ledger.summary.totalPaid)} color="#2E9E52" />
                <Summary label="Outstanding" value={money(ledger.summary.totalBalance)} color={ledger.summary.totalBalance > 0 ? "#C2571A" : "#2E9E52"} />
              </View>
              <Text style={styles.summaryMeta}>
                {ledger.summary.billCount} bill{ledger.summary.billCount === 1 ? "" : "s"} · {ledger.summary.paymentCount} payment{ledger.summary.paymentCount === 1 ? "" : "s"} on record
              </Text>
            </View>

            <Text style={styles.sectionTitle}>History (oldest first)</Text>
            {ledger.bills.length === 0 && <Text style={styles.empty}>No bills raised for this unit yet.</Text>}
            {ledger.bills.map((b) => {
              const st = STATUS[b.status] || STATUS.pending;
              return (
                <View key={b.id} style={styles.billCard}>
                  <View style={styles.billTop}>
                    <Text style={styles.billPeriod}>{b.period}</Text>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text>
                    </View>
                  </View>
                  <View style={styles.billNums}>
                    <BillNum label="Amount" value={money(b.amount)} />
                    <BillNum label="Paid" value={money(b.paidAmount)} color="#2E9E52" />
                    <BillNum label="Balance" value={money(b.balance)} color={b.balance > 0 ? "#C2571A" : "#6B7B85"} />
                  </View>

                  {b.payments && b.payments.length > 0 ? (
                    <View style={styles.payList}>
                      {b.payments.map((p) => (
                        <View key={p.id} style={styles.payRow}>
                          <Ionicons
                            name={p.mode === "cash" ? "cash-outline" : "card-outline"}
                            size={15}
                            color={p.mode === "cash" ? "#8A5A00" : "#0B6E8F"}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.payAmt}>
                              {money(p.amount)} <Text style={styles.payMode}>· {p.mode === "cash" ? "Cash" : "Online"}</Text>
                            </Text>
                            <Text style={styles.payMeta}>
                              {fmtDate(p.createdAt)}
                              {p.collectedBy ? ` · by ${p.collectedBy}` : ""}
                              {p.ref ? ` · ${p.ref}` : ""}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noPay}>No payments recorded against this bill.</Text>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Summary({ label, value, color }) {
  return (
    <View style={styles.summaryBox}>
      <Text style={[styles.summaryVal, { color }]}>{value}</Text>
      <Text style={styles.summaryLbl}>{label}</Text>
    </View>
  );
}

function BillNum({ label, value, color = "#1B2B33" }) {
  return (
    <View style={styles.billNumBox}>
      <Text style={styles.billNumLbl}>{label}</Text>
      <Text style={[styles.billNumVal, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 28 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E3EAEE",
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1B2B33" },
  flatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  flatIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "#EAF4F7", alignItems: "center", justifyContent: "center" },
  flatNo: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  flatMeta: { color: "#6B7B85", fontSize: 12, marginTop: 3 },

  summaryCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  summarySociety: { color: "#6B7B85", fontSize: 12, marginBottom: 10, fontWeight: "600" },
  summaryGrid: { flexDirection: "row", gap: 10 },
  summaryBox: { flex: 1, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 12 },
  summaryVal: { fontSize: 16, fontWeight: "800" },
  summaryLbl: { color: "#6B7B85", fontSize: 11, marginTop: 3 },
  summaryMeta: { color: "#8895A0", fontSize: 12, marginTop: 12 },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 22, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  billCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 },
  billTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  billPeriod: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  billNums: { flexDirection: "row", gap: 10, marginTop: 12 },
  billNumBox: { flex: 1, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 10 },
  billNumLbl: { color: "#6B7B85", fontSize: 11 },
  billNumVal: { fontSize: 14, fontWeight: "800", marginTop: 3 },
  payList: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#EAEEF0", paddingTop: 8 },
  payRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  payAmt: { color: "#1B2B33", fontWeight: "700", fontSize: 13 },
  payMode: { color: "#6B7B85", fontWeight: "600", fontSize: 12 },
  payMeta: { color: "#8895A0", fontSize: 11, marginTop: 1 },
  noPay: { color: "#8895A0", fontSize: 12, marginTop: 10, fontStyle: "italic" },
});
