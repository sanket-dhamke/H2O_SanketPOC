import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { body, head } from "../lib/type";
import { useAuth } from "../lib/auth";

// One Logout control for the whole app. It is never placed in the same row as
// page icons, so a tab with four tools cannot wrap it, restyle it, or steal
// the tap (that tap was opening account details).
export function LogoutButton({ onPress, style }) {
  const { logout } = useAuth();
  return (
    <TouchableOpacity
      onPress={onPress || logout}
      style={[styles.logoutBtn, style]}
      accessibilityRole="button"
      accessibilityLabel="Logout"
      testID="logout-button"
    >
      <Ionicons name="log-out-outline" size={16} color="#9F1239" />
      <Text style={styles.logout}>Logout</Text>
    </TouchableOpacity>
  );
}

// Consistent gradient page header used across the inner screens. Matches the
// Home hero styling: teal gradient, rounded bottom, icon chip + title/subtitle,
// a faint watermark icon, an optional tools row, and an optional back button
// (pass onBack to show it).
// Pass `logo` (an image source) to show a brand image in the chip instead of the
// Ionicon (used for the GATEZO owner headers).
export default function ScreenHeader({ icon, title, subtitle, right, onBack, logo }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { logout } = useAuth();
  const compact = width < 430;
  return (
    <LinearGradient
      colors={["#0E85AC", "#0B6E8F", "#075064"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 16 }]}
    >
      {logo ? (
        <Image source={logo} pointerEvents="none" style={styles.watermarkLogo} resizeMode="contain" />
      ) : (
        <Ionicons name={icon} pointerEvents="none" size={130} color="rgba(255,255,255,0.10)" style={styles.watermark} />
      )}
      {!!onBack && (
        <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      )}
      <View style={[styles.row, compact && styles.rowCompact]} pointerEvents="box-none">
        <View style={[styles.iconChip, logo && styles.logoChip, compact && styles.iconChipCompact]}>
          {logo ? (
            <Image source={logo} style={[styles.logoImg, compact && styles.logoImgCompact]} resizeMode="cover" />
          ) : (
            <Ionicons name={icon} size={22} color="#fff" />
          )}
        </View>
        <View style={styles.titleWrap}>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {right ? <View style={styles.tools}>{right}</View> : null}
      <LogoutButton onPress={logout} style={[styles.logoutPin, { top: insets.top + 14 }]} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  watermark: { position: "absolute", right: -14, top: 4, zIndex: 0 },
  watermarkLogo: { position: "absolute", right: -10, top: 8, width: 120, height: 120, opacity: 0.12, zIndex: 0 },
  backBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginBottom: 12, marginLeft: -4, zIndex: 1 },
  backText: { color: "#fff", fontSize: 14, ...body(700), marginLeft: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, zIndex: 1, paddingRight: 116 },
  rowCompact: { gap: 8, paddingRight: 108 },
  titleWrap: { flex: 1, minWidth: 0 },
  // Page tools sit on the right, on the row under the Logout pill.
  tools: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    alignSelf: "flex-end",
    gap: 8,
    marginTop: 12,
    zIndex: 1,
  },
  logoutPin: { position: "absolute", right: 16, zIndex: 5 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    flexShrink: 0,
    minWidth: 104,
  },
  logout: { color: "#9F1239", fontSize: 13, ...body(700) },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconChipCompact: { width: 40, height: 40, borderRadius: 12 },
  logoChip: { backgroundColor: "#fff", overflow: "hidden" },
  logoImg: { width: 46, height: 46, borderRadius: 14 },
  logoImgCompact: { width: 40, height: 40, borderRadius: 12 },
  title: {
    color: "#fff",
    fontSize: 22,
    ...head(800),
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  titleCompact: { fontSize: 17, lineHeight: 21 },
  subtitle: { color: "#CDE9F2", fontSize: 13, marginTop: 2, ...body(400)},
});
