import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import TextInput from "../../components/AppTextInput";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);

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

export default function AccountsScreen({ navigation }) {
  const [books, setBooks] = useState(null);
  const [flats, setFlats] = useState([]);
  const [report, setReport] = useState(null);
  const [holder, setHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [kind, setKind] = useState("income");
  const [amount, setAmount] = useState("");
  const [ledger, setLedger] = useState("Maintenance income");
  const [accountId, setAccountId] = useState("");
  const [narration, setNarration] = useState("");
  const [statement, setStatement] = useState("");
  const [lockDate, setLockDate] = useState("");
  const [flatId, setFlatId] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [period, setPeriod] = useState(thisMonth());

  const load = useCallback(async () => {
    try {
      const [book, flatRes] = await Promise.all([api.books(), api.adminListFlats()]);
      setBooks(book);
      setFlats(flatRes.flats || []);
      setLockDate(book.booksLockedThrough || "");
      setAccountId((current) => current || book.accounts?.[0]?.id || "");
    } catch (e) {
      tell("Accounts", e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addAccount = async () => {
    try {
      await api.addBankAccount({ accountHolderName: holder, bankName, accountNumber: accountNo });
      setHolder("");
      setBankName("");
      setAccountNo("");
      load();
    } catch (e) {
      tell("Bank account", e.message);
    }
  };

  const addVoucher = async () => {
    try {
      await api.addVoucher({ kind, amount: Number(amount), ledger, accountId: accountId || null, narration, date: today() });
      setAmount("");
      setNarration("");
      load();
    } catch (e) {
      tell("Voucher", e.message);
    }
  };

  const reconcile = async () => {
    try {
      const res = await api.reconcileBank({ accountId, statementDate: today(), statementBalance: Number(statement) });
      const diff = res.reconciliation?.difference;
      tell("Reconciled", `Statement ${money(res.reconciliation.statementBalance)}, book ${money(res.reconciliation.ledgerBalance)}, difference ${money(diff)}.`);
      setStatement("");
      load();
    } catch (e) {
      tell("Reconcile", e.message);
    }
  };

  const lock = async () => {
    try {
      await api.lockBooks(lockDate);
      tell("Financial year", lockDate ? `Books are locked through ${lockDate}.` : "The lock was cleared.");
      load();
    } catch (e) {
      tell("Lock", e.message);
    }
  };

  const tally = async () => {
    try {
      const xml = await api.tallyXml();
      if (!saveText("gatezo-tally.xml", xml, "application/xml")) tell("Tally", "Open this on the website to download the file.");
    } catch (e) {
      tell("Tally", e.message);
    }
  };

  const invoice = async () => {
    try {
      const res = await api.raiseInvoice({ flatId, amount: Number(invoiceAmount), period, dueDate: `${period}-10` });
      tell("Invoice", `${res.bill.invoiceNo} for ${res.bill.flatNo} is ${money(res.bill.amount)}.`);
      setInvoiceAmount("");
    } catch (e) {
      tell("Invoice", e.message);
    }
  };

  const loadReport = async () => {
    try {
      setReport(await api.monthReport(period));
    } catch (e) {
      tell("Report", e.message);
    }
  };

  const duesFile = async () => {
    try {
      const csv = await api.duesCsv(period);
      if (!saveText(`dues-${period}.csv`, csv, "text/csv")) tell("Dues", csv.slice(0, 400));
    } catch (e) {
      tell("Dues", e.message);
    }
  };

  const fy = books?.financialYear;
  const flatList = Array.isArray(flats) ? flats : [];

  return (
    <View style={styles.container}>
      <ScreenHeader icon="library" title="Society accounts" subtitle={fy ? fy.label : "Books"} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>Bank accounts</Text>
        {(books?.accounts || []).map((a) => (
          <TouchableOpacity key={a.id} style={[styles.card, accountId === a.id && styles.cardOn]} onPress={() => setAccountId(a.id)}>
            <Text style={styles.cardTitle}>{a.bankName || "Bank"} · {a.accountHolderName}</Text>
            <Text style={styles.meta}>{a.accountNumber || "No number"} · Ledger {money(a.ledgerBalance)}</Text>
          </TouchableOpacity>
        ))}
        <TextInput style={styles.input} value={holder} onChangeText={setHolder} placeholder="Account holder" />
        <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="Bank name" />
        <TextInput style={styles.input} value={accountNo} onChangeText={setAccountNo} placeholder="Account number" />
        <Btn label="Add bank account" onPress={addAccount} />

        <Text style={styles.section}>Voucher</Text>
        <View style={styles.row}>
          {["income", "expense"].map((k) => (
            <TouchableOpacity key={k} style={[styles.chip, kind === k && styles.chipOn]} onPress={() => setKind(k)}>
              <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          {(books?.ledgers || []).map((name) => (
            <TouchableOpacity key={name} style={[styles.chip, ledger === name && styles.chipOn]} onPress={() => setLedger(name)}>
              <Text style={[styles.chipText, ledger === name && styles.chipTextOn]}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="numeric" />
        <TextInput style={styles.input} value={narration} onChangeText={setNarration} placeholder="Narration" />
        <Btn label="Post voucher" onPress={addVoucher} />

        <Text style={styles.section}>Reconcile selected account</Text>
        <TextInput style={styles.input} value={statement} onChangeText={setStatement} placeholder="Statement balance" keyboardType="numeric" />
        <Btn label="Compare with the book" onPress={reconcile} />
        {(books?.reconciliations || []).slice(0, 3).map((r) => (
          <Text key={r.id} style={styles.meta}>
            {r.statementDate}: statement {money(r.statementBalance)} · book {money(r.ledgerBalance)}
          </Text>
        ))}

        <Text style={styles.section}>Financial year lock</Text>
        <Text style={styles.meta}>Locked through {books?.booksLockedThrough || "not locked"}. Dates on or before that day cannot take a new voucher or invoice.</Text>
        <TextInput style={styles.input} value={lockDate} onChangeText={setLockDate} placeholder="YYYY-MM-DD, blank to unlock" />
        <Btn label="Save lock" onPress={lock} />
        <Btn label="Download Tally XML" onPress={tally} />

        <Text style={styles.section}>Raise one invoice</Text>
        <Text style={styles.meta}>Next number uses {books?.invoicePrefix || "INV"} and sequence {books?.invoiceNext || 1}.</Text>
        <View style={styles.row}>
          {flatList.slice(0, 12).map((f) => (
            <TouchableOpacity key={f.id} style={[styles.chip, flatId === f.id && styles.chipOn]} onPress={() => setFlatId(f.id)}>
              <Text style={[styles.chipText, flatId === f.id && styles.chipTextOn]}>{f.flatNo}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} value={invoiceAmount} onChangeText={setInvoiceAmount} placeholder="Amount" keyboardType="numeric" />
        <TextInput style={styles.input} value={period} onChangeText={setPeriod} placeholder="YYYY-MM" />
        <Btn label="Raise invoice" onPress={invoice} />

        <Text style={styles.section}>MIS, dues and collection</Text>
        <Btn label={`Load ${period}`} onPress={loadReport} />
        {report?.mis ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{report.period} · {report.mis.collectedPct}% collected</Text>
            <Text style={styles.meta}>Invoiced {money(report.mis.invoiced)}</Text>
            <Text style={styles.meta}>Collected {money(report.mis.collected)}</Text>
            <Text style={styles.meta}>Pending {money(report.mis.pending)}</Text>
            <Text style={styles.meta}>Expenses {money(report.mis.expenses)} · Vendor unpaid {money(report.mis.vendorUnpaid)}</Text>
            <Text style={styles.meta}>{report.dues?.length || 0} flats still owe.</Text>
          </View>
        ) : null}
        <Btn label="Download dues CSV" onPress={duesFile} />
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
  cardOn: { borderWidth: 1, borderColor: "#0B6E8F" },
  cardTitle: { fontWeight: "700", color: "#14323C" },
  meta: { color: "#5C6E76", marginTop: 4, fontSize: 13 },
  input: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { backgroundColor: "#E7F2F6", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: "#0B6E8F" },
  chipText: { color: "#0B6E8F", fontSize: 12, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  btn: { backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 8 },
  btnText: { color: "#fff", fontWeight: "700" },
});
