import React from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { brand } from "../../lib/brand";
import { body, head } from "../../lib/type";

const STEPS = [
  {
    title: "1. Set the hours you can work",
    body: "Open Hours and choose when you take visits. Residents only see a time if a professional who does that service is free then. Sunday is off until you turn it on.",
  },
  {
    title: "2. A visit is offered to you for 60 seconds",
    body: "GATEZO offers the booking to one professional at a time, the way Urban Company does. Accept it, or pass. If the minute ends, it moves to the next free professional.",
  },
  {
    title: "3. Start only with the resident’s code",
    body: "After you accept, ask the resident for the 4-digit start code on their booking. The visit does not begin until that code matches.",
  },
  {
    title: "4. Finish only with a second code",
    body: "When the work is done, the resident sees a different finish code. Enter that code and tap Mark done. You cannot close the visit without it.",
  },
  {
    title: "5. The resident rates the visit",
    body: "After it is marked done, the resident gives a rating. That rating is what the owner and the next resident see on your profile.",
  },
  {
    title: "House desk",
    body: `The ${brand.name} desk does not take the first offer. It receives the visit only after every other professional has passed, and it does not pay the annual pack.`,
  },
];

export default function ProviderGuideScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader icon="book" title={`How ${brand.name} works`} subtitle="For service professionals" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.lead}>
          This login is only for people who do home services. Residents, guards and society admins use a different account.
        </Text>
        {STEPS.map((step) => (
          <View key={step.title} style={styles.card}>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  lead: { color: "#1B2B33", ...body(400), lineHeight: 20, marginBottom: 8 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginTop: 10 },
  title: { ...head(700), color: "#0B6E8F", fontSize: 16 },
  body: { color: "#1B2B33", ...body(400), marginTop: 6, lineHeight: 20 },
});
