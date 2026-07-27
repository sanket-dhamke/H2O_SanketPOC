import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { paySubscription } from "../../lib/pay";
import ScreenHeader from "../../components/ScreenHeader";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

function notify(title, message) {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export default function PayToH2OScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.adminSubscription());
    } catch (e) {
      notify("Error", e.message);
    } finally {
      setLoading(false);
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

  const pay = async () => {
    if (!(Number(data?.planAmount) > 0)) {
      notify("No amount set", "H2O hasn't set your subscription amount yet. Please contact H2O support.");
      return;
    }
    setBusy(true);
    try {
      const result = await paySubscription();
      if (result?.cancelled) return;
      await load();
      notify("Payment successful", "Your H2O subscription is now active. Thank you!");
    } catch (e) {
      notify("Payment failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader icon="ribbon" title="Pay to H2O" subtitle="Platform subscription" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0B6E8F" />
        </View>
      </View>
    );
  }

  const premium = data?.premium;
  const amount = Number(data?.planAmount) || 0;
  const p = data?.platform || {};
  const hasBank = p.accountName || p.bankName || p.accountNumber || p.upiId;

  return (
    <View style={styles.container}>
      <ScreenHeader icon="ribbon" title="Pay to H2O" subtitle="Platform subscription" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Plan status */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, premium ? styles.badgeOn : styles.badgeOff]}>
            <Ionicons name={premium ? "checkmark-circle" : "alert-circle"} size={16} color={premium ? "#1E7A3D" : "#C2571A"} />
            <Text style={[styles.statusBadgeText, { color: premium ? "#1E7A3D" : "#C2571A" }]}>
              {premium ? "Premium — active" : "Free plan"}
            </Text>
          </View>
          <Text style={styles.statusLine}>
            {premium
              ? `Your H2O subscription is active until ${fmtDate(data?.planExpiresAt)}.`
              : "Upgrade to unlock premium features (vendor marketplace, voice AI & more)."}
          </Text>
          <View style={styles.amountRow}>
            <View>
              <Text style={styles.amountLabel}>Yearly subscription</Text>
              <Text style={styles.amountValue}>{amount > 0 ? money(amount) : "Not set yet"}</Text>
            </View>
            <TouchableOpacity
              style={[styles.payBtn, (busy || amount <= 0) && { opacity: 0.6 }]}
              onPress={pay}
              disabled={busy || amount <= 0}
            >
              <Ionicons name="card" size={18} color="#fff" />
              <Text style={styles.payBtnText}>{busy ? "Processing..." : premium ? "Renew now" : "Pay now"}</Text>
            </TouchableOpacity>
          </View>
          {amount <= 0 && (
            <Text style={styles.hint}>H2O hasn't set your plan amount yet. Contact H2O support to get started.</Text>
          )}
        </View>

        {/* H2O reference details */}
        <Text style={styles.sectionTitle}>H2O account (for reference)</Text>
        <View style={styles.refCard}>
          {p.contactEmail && <RefRow icon="mail-outline" label="Contact" value={p.contactEmail} />}
          {hasBank ? (
            <>
              {p.accountName && <RefRow icon="person-outline" label="Account name" value={p.accountName} />}
              {p.bankName && <RefRow icon="business-outline" label="Bank" value={p.bankName} />}
              {p.accountNumber && <RefRow icon="card-outline" label="Account no." value={p.accountNumber} />}
              {p.ifsc && <RefRow icon="key-outline" label="IFSC" value={p.ifsc} />}
              {p.upiId && <RefRow icon="at-outline" label="UPI" value={p.upiId} />}
            </>
          ) : (
            <Text style={styles.hint}>H2O bank details aren't published yet.</Text>
          )}
          <Text style={styles.refNote}>
            Payment is collected securely in-app. These details are shown for reference only.
          </Text>
        </View>

        {/* Payment history */}
        <Text style={styles.sectionTitle}>Payment history</Text>
        {(data?.payments || []).length === 0 && <Text style={styles.empty}>No subscription payments yet.</Text>}
        {(data?.payments || []).map((pay) => (
          <View key={pay.id} style={styles.payRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.payAmt}>{money(pay.amount)}</Text>
              <Text style={styles.paySub} numberOfLines={1}>
                {fmtDate(pay.paidAt)}{pay.period ? ` · ${pay.period}` : ""}
              </Text>
            </View>
            {!!pay.ref && <Text style={styles.payRef} numberOfLines={1}>{pay.ref}</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function RefRow({ icon, label, value }) {
  return (
    <View style={styles.refRow}>
      <Ionicons name={icon} size={16} color="#0B6E8F" />
      <Text style={styles.refLabel}>{label}</Text>
      <Text style={styles.refValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  statusCard: { backgroundColor: "#fff", borderRadius: 16, padding: 18 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeOn: { backgroundColor: "#DFF3E6" },
  badgeOff: { backgroundColor: "#FBE4D5" },
  statusBadgeText: { fontWeight: "700", fontSize: 13 },
  statusLine: { color: "#6B7B85", fontSize: 13, lineHeight: 19, marginTop: 12 },
  amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
  amountLabel: { color: "#8895A0", fontSize: 12 },
  amountValue: { fontSize: 24, fontWeight: "800", color: "#1B2B33", marginTop: 2 },
  payBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0B6E8F", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14 },
  payBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  hint: { color: "#8895A0", fontSize: 12, marginTop: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 24, marginBottom: 10 },
  refCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  refRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EAEEF0" },
  refLabel: { color: "#6B7B85", fontSize: 13, width: 96 },
  refValue: { color: "#1B2B33", fontSize: 14, fontWeight: "600", flex: 1, textAlign: "right" },
  refNote: { color: "#8895A0", fontSize: 12, marginTop: 12, lineHeight: 17 },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 8 },
  payRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 },
  payAmt: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  paySub: { color: "#8895A0", fontSize: 12, marginTop: 2 },
  payRef: { color: "#8895A0", fontSize: 11, maxWidth: 120 },
});
