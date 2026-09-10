import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { adsFor, spotlightFor, slotMeta } from "../lib/ads";
import { toImageSource } from "../lib/serviceImages";
import { openScreen } from "../lib/nav";
import { body, head } from "../lib/type";
import { useAuth } from "../lib/auth";
import { isPreschool } from "../lib/org";

function copyCode(code) {
  if (!code) return;
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code);
    }
  } catch {
    /* Alert still shows the code */
  }
  Alert.alert("Promo code", `${code}\n\nCopied where the browser allows it. Paste it at checkout.`);
}

function openOffer(item, navigation) {
  if (item.serviceSlug && navigation) {
    openScreen(navigation, "Community", {
      screen: "HomeServiceDetail",
      params: { slug: item.serviceSlug },
    });
    return;
  }
  if (item.route && navigation) {
    openScreen(navigation, item.route, item.params);
    return;
  }
  if (item.link) Linking.openURL(item.link).catch(() => {});
}

function OfferThumb({ item }) {
  const [failed, setFailed] = React.useState(false);
  const src = toImageSource(item.image);
  return (
    <View style={[styles.offerImgWrap, { backgroundColor: item.color || "#0B6E8F" }]}>
      {src && !failed ? (
        <Image
          source={src}
          resizeMode="cover"
          onError={() => setFailed(true)}
          style={styles.offerImg}
        />
      ) : (
        <Ionicons name={item.icon || "pricetag"} size={36} color="#fff" />
      )}
    </View>
  );
}

function OfferCard({ item, navigation }) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.offerCard} onPress={() => openOffer(item, navigation)}>
      <View style={styles.offerCopy}>
        <Text style={styles.offerBrand} numberOfLines={1}>
          {item.brand}
        </Text>
        <Text style={styles.offerTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.offerSub} numberOfLines={2}>
          {item.subtitle}
        </Text>
        {item.code ? (
          <TouchableOpacity style={styles.codeRow} onPress={() => copyCode(item.code)} activeOpacity={0.8}>
            <Text style={styles.codeText}>{item.code}</Text>
            <Ionicons name="copy-outline" size={14} color="#0B6E8F" />
          </TouchableOpacity>
        ) : (
          <View style={[styles.ctaChip, { backgroundColor: item.color || "#0B6E8F" }]}>
            <Text style={styles.ctaChipText}>{item.cta || "View"}</Text>
          </View>
        )}
      </View>
      <OfferThumb item={item} />
    </TouchableOpacity>
  );
}

function SpotlightCard({ item, navigation, tall }) {
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={[styles.spotCard, tall && styles.spotCardTall]}
      onPress={() => openOffer(item, navigation)}
    >
      <Image
        source={toImageSource(item.image)}
        resizeMode="cover"
        style={styles.spotImg}
      />
      <View style={styles.spotShade} />
      {item.badge ? (
        <View style={styles.spotBadge}>
          <Text style={styles.spotBadgeText}>{item.badge}</Text>
        </View>
      ) : null}
      <View style={styles.spotBody}>
        <Text style={styles.spotBrand}>{item.brand}</Text>
        <Text style={styles.spotTitle}>{item.title}</Text>
        <Text style={styles.spotSub}>{item.subtitle}</Text>
        <View style={[styles.spotCta, { backgroundColor: item.color || "#0B6E8F" }]}>
          <Text style={styles.spotCtaText}>{item.cta || "Claim offer"}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function OffersRail({ slot = "home", navigation, showSpotlight = false, compact = false }) {
  const { user } = useAuth();
  const { width: winW } = useWindowDimensions();
  const meta = slotMeta(slot);
  const offers = adsFor(slot);
  const spots = showSpotlight ? spotlightFor(slot) : [];

  if (isPreschool(user)) return null;
  if (!offers.length && !spots.length) return null;

  return (
    <View style={[styles.wrap, compact && { marginTop: 8 }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{meta.title}</Text>
          {meta.hint ? <Text style={styles.hint}>{meta.hint}</Text> : null}
        </View>
        <View style={styles.adTag}>
          <Text style={styles.adTagText}>Offer</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {offers.map((item) => (
          <OfferCard key={item.id} item={item} navigation={navigation} />
        ))}
      </View>

      {spots.length ? (
        <>
          <View style={[styles.head, { marginTop: 18 }]}>
            <Text style={styles.title}>In the Spotlight</Text>
          </View>
          <View style={styles.spotStack}>
            {spots.map((item) => (
              <SpotlightCard key={item.id} item={item} navigation={navigation} tall={winW >= 720} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18, marginBottom: 8, width: "100%", alignSelf: "stretch" },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 17, ...head(800), color: "#1B2B33" },
  hint: { fontSize: 12, color: "#6B7B85", marginTop: 2, ...body(400) },
  adTag: {
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  adTagText: { fontSize: 10, color: "#8895A0", ...body(600) },
  grid: { flexDirection: "row", flexWrap: "wrap", width: "100%", gap: 12 },
  offerCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 260,
    minWidth: 220,
    height: 156,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#E6EEF2",
  },
  offerCopy: { flex: 1, padding: 16, justifyContent: "center", minWidth: 0 },
  offerBrand: { fontSize: 11, color: "#8895A0", ...body(700), textTransform: "uppercase", letterSpacing: 0.4 },
  offerTitle: { fontSize: 16, ...head(800), color: "#1B2B33", marginTop: 4 },
  offerSub: { fontSize: 13, color: "#5C6E78", marginTop: 4, ...body(400) },
  codeRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#0B6E8F",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#F3FAFC",
  },
  codeText: { fontSize: 12, color: "#0B6E8F", ...body(700) },
  ctaChip: { alignSelf: "flex-start", marginTop: 10, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  ctaChipText: { color: "#fff", fontSize: 12, ...body(700) },
  offerImgWrap: {
    width: 148,
    height: 156,
    flexShrink: 0,
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B6E8F",
  },
  offerImg: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 148,
    height: 156,
    ...(Platform.OS === "web" ? { objectFit: "cover" } : null),
  },
  spotStack: { width: "100%", gap: 12 },
  spotCard: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#0B3A49",
  },
  spotCardTall: { height: 240 },
  spotImg: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    ...(Platform.OS === "web" ? { objectFit: "cover" } : null),
  },
  spotShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,20,28,0.45)" },
  spotBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#E4002B",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  spotBadgeText: { color: "#fff", fontSize: 10, ...head(800), letterSpacing: 0.4 },
  spotBody: { position: "absolute", left: 16, right: 16, bottom: 16 },
  spotBrand: { color: "rgba(255,255,255,0.85)", fontSize: 12, ...body(600) },
  spotTitle: { color: "#fff", fontSize: 22, ...head(800), marginTop: 2 },
  spotSub: { color: "#EAF0F2", fontSize: 13, marginTop: 4, ...body(400) },
  spotCta: { alignSelf: "flex-start", marginTop: 12, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 },
  spotCtaText: { color: "#fff", fontSize: 13, ...body(700) },
});
