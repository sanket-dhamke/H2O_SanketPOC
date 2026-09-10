import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { registerPaySheet } from "../lib/paySheet";
import { body, head } from "../lib/type";

const METHODS = [
  { id: "gpay", label: "Google Pay", hint: "UPI", method: "upi", app: "google_pay", color: "#1A73E8", mark: "G" },
  { id: "phonepe", label: "PhonePe", hint: "UPI", method: "upi", app: "phonepe", color: "#5F259F", mark: "P" },
  { id: "paytm", label: "Paytm", hint: "UPI", method: "upi", app: "paytm", color: "#00BAF2", mark: "₹" },
  { id: "vpa", label: "UPI ID / QR", hint: "Enter VPA or scan", method: "upi", color: "#0B6E8F", mark: "U" },
  { id: "card", label: "Card / net banking", hint: "Visa, Mastercard, banks", method: "card", color: "#1C2B33", mark: "₹" },
];

export default function PayMethodSheet() {
  const [open, setOpen] = useState(null);

  useEffect(() => {
    return registerPaySheet((opts) =>
      new Promise((resolve) => {
        setOpen({ ...opts, resolve });
      })
    );
  }, []);

  const finish = (value) => {
    open?.resolve(value);
    setOpen(null);
  };

  if (!open) return null;
  const rupees = Math.round(Number(open.amountPaise || 0) / 100);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => finish(null)}>
      <Pressable style={styles.bg} onPress={() => finish(null)}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.kicker}>Pay ₹{rupees.toLocaleString("en-IN")}</Text>
          <Text style={styles.title}>Pay via UPI</Text>
          <Text style={styles.sub}>Google Pay, PhonePe, Paytm or a UPI ID.</Text>
          {METHODS.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.row}
              onPress={() => finish({ method: m.method, app: m.app })}
              activeOpacity={0.8}
            >
              <View style={[styles.dot, { backgroundColor: m.color }]}>
                <Text style={styles.dotText}>{m.mark}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.label}</Text>
                <Text style={styles.hint}>{m.hint}</Text>
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => finish(null)} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: "rgba(12,28,36,0.48)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 99,
    backgroundColor: "#D6DEE3",
    alignSelf: "center",
    marginBottom: 14,
  },
  kicker: { color: "#6B7B85", fontSize: 12, ...body(600) },
  title: { color: "#1B2B33", fontSize: 20, marginTop: 4, ...head(800) },
  sub: { color: "#5A6B74", fontSize: 13, marginTop: 2, marginBottom: 14, ...body(400) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#E6EEF2",
    backgroundColor: "#F7FAFB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dotText: { color: "#fff", fontSize: 14, ...head(800) },
  name: { color: "#1B2B33", fontSize: 14, ...body(700) },
  hint: { color: "#6B7B85", fontSize: 12, marginTop: 1, ...body(400) },
  cancel: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: "#6B7B85", fontSize: 14, ...body(700) },
});
