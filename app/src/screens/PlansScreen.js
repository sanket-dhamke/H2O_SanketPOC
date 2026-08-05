import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { labelsFor } from "../lib/org";
import { TIERS, TIER_LABEL, TIER_COLOR, TIER_RANK, TIER_FEATURES, tierFor } from "../lib/plan";
import ScreenHeader from "../components/ScreenHeader";

const TIER_TAGLINE = {
  base: "Core operations to run digitally",
  prime: "Automation, AI & engagement",
  platinum: "Hardware-integrated smart gate",
};
const TIER_ICON = { base: "shield-outline", prime: "rocket-outline", platinum: "diamond-outline" };

export default function PlansScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const L = labelsFor(user);
  const current = tierFor(user);
  const currentRank = TIER_RANK[current];

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="pricetags"
        title="Plans & pricing"
        subtitle="What your plan includes"
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View style={styles.currentBanner}>
          <View style={[styles.currentDot, { backgroundColor: TIER_COLOR[current] }]} />
          <Text style={styles.currentText}>
            Your {L.org.toLowerCase()} is on the{" "}
            <Text style={{ color: TIER_COLOR[current], fontWeight: "800" }}>{TIER_LABEL[current]}</Text> plan
          </Text>
        </View>

        {TIERS.map((t) => {
          const rank = TIER_RANK[t];
          const isCurrent = t === current;
          const isLower = rank < currentRank;
          const isUpgrade = rank > currentRank;
          const color = TIER_COLOR[t];
          return (
            <View key={t} style={[styles.card, isCurrent && { borderColor: color, borderWidth: 2 }]}>
              <View style={styles.cardHead}>
                <View style={[styles.tierIcon, { backgroundColor: color + "1A" }]}>
                  <Ionicons name={TIER_ICON[t]} size={20} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tierName, { color }]}>{TIER_LABEL[t]}</Text>
                  <Text style={styles.tierTag}>{TIER_TAGLINE[t]}</Text>
                </View>
                {isCurrent && (
                  <View style={[styles.statusPill, { backgroundColor: color }]}>
                    <Text style={styles.statusPillText}>Current</Text>
                  </View>
                )}
                {isLower && (
                  <View style={[styles.statusPill, styles.pillIncluded]}>
                    <Text style={[styles.statusPillText, { color: "#5A6B75" }]}>Included</Text>
                  </View>
                )}
                {isUpgrade && (
                  <View style={[styles.statusPill, styles.pillLocked]}>
                    <Ionicons name="lock-closed" size={11} color="#8A5A00" />
                    <Text style={[styles.statusPillText, { color: "#8A5A00" }]}> Upgrade</Text>
                  </View>
                )}
              </View>

              <View style={styles.features}>
                {TIER_FEATURES[t].map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons
                      name={isUpgrade ? "lock-closed-outline" : "checkmark-circle"}
                      size={16}
                      color={isUpgrade ? "#B7C1C8" : color}
                    />
                    <Text style={[styles.featureText, isUpgrade && { color: "#8895A0" }]}>{f}</Text>
                  </View>
                ))}
              </View>

              {isUpgrade && (
                <View style={styles.upgradeNote}>
                  <Ionicons name="arrow-up-circle-outline" size={16} color="#8A5A00" />
                  <Text style={styles.upgradeNoteText}>Ask your GateMate owner to upgrade to unlock these.</Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.footer}>
          <Ionicons name="information-circle-outline" size={18} color="#6B7B85" />
          <Text style={styles.footerText}>
            Your plan is set by the GateMate owner. To upgrade or ask about pricing, contact GateMate support from your profile.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  currentBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 14 },
  currentDot: { width: 12, height: 12, borderRadius: 6 },
  currentText: { flex: 1, color: "#1B2B33", fontSize: 14, fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#E8EDF0" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  tierIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tierName: { fontSize: 18, fontWeight: "800" },
  tierTag: { color: "#6B7B85", fontSize: 12.5, marginTop: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  pillIncluded: { backgroundColor: "#EEF2F4" },
  pillLocked: { backgroundColor: "#FDF0D0" },
  features: { marginTop: 14, gap: 9 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  featureText: { flex: 1, color: "#334", fontSize: 13.5, lineHeight: 19 },
  upgradeNote: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FDF6E6", borderRadius: 10, padding: 10, marginTop: 12 },
  upgradeNoteText: { flex: 1, color: "#8A5A00", fontSize: 12.5, fontWeight: "600" },
  footer: { flexDirection: "row", gap: 8, backgroundColor: "#EAF4F7", borderRadius: 12, padding: 12, marginTop: 4 },
  footerText: { flex: 1, color: "#3A5460", fontSize: 12.5, lineHeight: 18 },
});
