import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HOME_SERVICES, FEATURED_SLUGS, inr } from "../lib/homeServices";
import { body, head } from "../lib/type";
import { openScreen } from "../lib/nav";
import ServiceThumb from "./ServiceThumb";

export default function HomeServicesStrip({ navigation }) {
  const featured = FEATURED_SLUGS.map((slug) => HOME_SERVICES.find((s) => s.slug === slug)).filter(Boolean);
  const openAll = () => openScreen(navigation, "Community", { screen: "HomeServices" });
  const openOne = (slug) =>
    openScreen(navigation, "Community", { screen: "HomeServiceDetail", params: { slug } });

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.head} onPress={openAll} activeOpacity={0.85}>
        <View style={styles.headIcon}>
          <Ionicons name="construct" size={20} color="#0B6E8F" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Home Services</Text>
          <Text style={styles.sub}>Cleaning, AC, painting, movers & more</Text>
        </View>
        <Text style={styles.seeAll}>See all</Text>
        <Ionicons name="chevron-forward" size={16} color="#0B6E8F" />
      </TouchableOpacity>
      <View style={styles.row}>
        {featured.map((s) => (
          <TouchableOpacity key={s.slug} style={styles.card} onPress={() => openOne(s.slug)} activeOpacity={0.88}>
            <ServiceThumb uri={s.image} icon={s.icon} color="#0B6E8F" style={styles.img} />
            {s.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{s.badge}</Text>
              </View>
            ) : null}
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {s.name}
              </Text>
              <Text style={styles.cardPrice}>{s.priceFrom === 0 ? "Free ideas" : `From ${inr(s.priceFrom)}`}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingTop: 4,
    paddingBottom: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E6EEF2",
    alignSelf: "stretch",
    width: "100%",
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  headIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#EAF4F7",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#1B2B33", fontSize: 15.5, ...head(800) },
  sub: { color: "#6B7B85", fontSize: 12, marginTop: 2, ...body(400) },
  seeAll: { color: "#0B6E8F", fontSize: 12, ...body(700) },
  row: { paddingHorizontal: 14, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 140,
    minWidth: 148,
    maxWidth: "100%",
    backgroundColor: "#F7FAFB",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E6EEF2",
  },
  img: { width: "100%", height: 86 },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#0B6E8F",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { color: "#fff", fontSize: 10, ...head(700) },
  cardBody: { paddingHorizontal: 9, paddingVertical: 8 },
  cardTitle: { fontSize: 12, ...head(700), color: "#1B2B33", lineHeight: 15 },
  cardPrice: { fontSize: 11, color: "#0B6E8F", marginTop: 3, ...body(600) },
});
