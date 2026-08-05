import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import TextInput from "../../components/AppTextInput";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { labelsFor } from "../../lib/org";
import ScreenHeader from "../../components/ScreenHeader";

export default function BankAccountScreen({ navigation }) {
  const { user } = useAuth();
  const L = labelsFor(user);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [razorpayAccountId, setRazorpayAccountId] = useState("");

  useEffect(() => {
    api
      .adminGetBankAccount()
      .then(({ account }) => {
        if (account) {
          setAccountHolderName(account.accountHolderName || "");
          setBankName(account.bankName || "");
          setAccountNumber(account.accountNumber || "");
          setIfsc(account.ifsc || "");
          setUpiId(account.upiId || "");
          setRazorpayAccountId(account.razorpayAccountId || "");
        }
      })
      .catch(() => {
        // A transient load failure (e.g. server restarting) just means we start
        // from an empty form — don't show a scary error for that.
      })
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    setError("");
    if (!accountHolderName.trim()) {
      setError("Account holder name is required.");
      return;
    }
    setBusy(true);
    try {
      await api.adminSaveBankAccount({
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim(),
        upiId: upiId.trim(),
        razorpayAccountId: razorpayAccountId.trim(),
      });
      Alert.alert("Saved", `${L.org} bank account updated.`);
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader icon="card" title="Bank account" subtitle={`${L.org} payout account`} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0B6E8F" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader icon="card" title="Bank account" subtitle={`Where ${L.fees.toLowerCase()} is collected`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <Text style={styles.subtitle}>
        {L.fees} collections are routed to this account. Add the Razorpay Route linked
        account id below to auto-settle online payments into it.
      </Text>

      <Text style={styles.label}>Account holder name *</Text>
      <TextInput
        style={styles.input}
        value={accountHolderName}
        onChangeText={setAccountHolderName}
        placeholder={L.org === "Preschool" ? "e.g. Little Millennium" : "e.g. Green Valley Society"}
      />

      <Text style={styles.label}>Bank name</Text>
      <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="e.g. HDFC Bank" />

      <Text style={styles.label}>Account number</Text>
      <TextInput
        style={styles.input}
        value={accountNumber}
        onChangeText={setAccountNumber}
        keyboardType="number-pad"
        placeholder="6-20 digits"
      />

      <Text style={styles.label}>IFSC</Text>
      <TextInput
        style={styles.input}
        value={ifsc}
        onChangeText={setIfsc}
        autoCapitalize="characters"
        placeholder="e.g. HDFC0001234"
      />

      <Text style={styles.label}>UPI ID (optional)</Text>
      <TextInput
        style={styles.input}
        value={upiId}
        onChangeText={setUpiId}
        autoCapitalize="none"
        placeholder="name@bank"
      />

      <View style={styles.divider} />

      <Text style={styles.label}>Razorpay linked account id</Text>
      <TextInput
        style={styles.input}
        value={razorpayAccountId}
        onChangeText={setRazorpayAccountId}
        autoCapitalize="none"
        placeholder="acc_XXXXXXXXXXXX"
      />
      <Text style={styles.hint}>
        Create a Linked Account in your Razorpay dashboard (Route → Linked Accounts) where the
        bank KYC is done, then paste its id (acc_…) here. When set, every online maintenance
        payment is transferred to this account. Leave blank to keep collecting into your main
        Razorpay account.
      </Text>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Saving..." : "Save bank account"}</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F1F5F7" },
  title: { fontSize: 22, fontWeight: "800", color: "#1B2B33", marginBottom: 6 },
  subtitle: { color: "#6B7B85", fontSize: 13, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#fff" },
  hint: { color: "#8895A0", fontSize: 12, marginTop: 6, lineHeight: 17 },
  divider: { height: 1, backgroundColor: "#E1E8EC", marginTop: 24 },
  error: { color: "#C0392B", backgroundColor: "#FBE7E4", padding: 12, borderRadius: 10, marginTop: 20, fontSize: 13, fontWeight: "600" },
  button: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
