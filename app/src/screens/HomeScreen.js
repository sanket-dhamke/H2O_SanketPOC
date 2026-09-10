import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { labelsFor, isPreschool } from "../lib/org";
import { hasFeature, requiredTierLabel } from "../lib/plan";
import OffersRail from "../components/OffersRail";
import HomeServicesStrip from "../components/HomeServicesStrip";
import ProfileModal from "../components/ProfileModal";
import AskGateMate from "../components/AskGateMate";
import HomeSummary from "../components/HomeSummary";
import { body, head } from "../lib/type";
import { composeHomeSummary } from "../lib/homeSummaryFallback";
import { openScreen } from "../lib/nav";
import { brand, brandIcon } from "../lib/brand";

// JPEG, not PNG: these are photographs, and as PNGs they were ~2.5 MB each.
// That is slow to decode on a mid-range phone every time the home tab mounts,
// and it bloated the APK for no visible gain — they sit under a dark overlay.
const HERO = {
  resident: require("../../assets/home-resident.jpg"),
  admin: require("../../assets/home-admin.jpg"),
  guard: require("../../assets/home-guard.jpg"),
};

// Preschool tenants share a warm classroom-themed backdrop instead of the
// society building photos, so a preschool with no custom branding still looks
// on-brand for its org type.
const PRESCHOOL_HERO = require("../../assets/preschool-bg.jpg");
const WEB_HERO = require("../../assets/society-bg-wide.jpg");
const WEB_PRESCHOOL = require("../../assets/preschool-bg-wide.jpg");

function HeroBleed({ source, height, onError, children }) {
  const { width } = useWindowDimensions();
  return (
    <View style={{ height, width: "100%", overflow: "hidden", backgroundColor: "#0B3A49", position: "relative" }}>
      <Image
        source={source}
        onError={onError}
        resizeMode="cover"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width,
          height,
          maxWidth: width,
          minWidth: width,
          ...(Platform.OS === "web" ? { objectFit: "cover" } : null),
        }}
      />
      {children}
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 420;
  const [profileOpen, setProfileOpen] = useState(false);
  const [bgError, setBgError] = useState(false);
  // One call replaces the old two-request dance (maintenance + visitors) and
  // returns everything the charts and the attention list need.
  const [summary, setSummary] = useState(null);
  const [summaryState, setSummaryState] = useState({ loading: true, error: false });
  const [refreshing, setRefreshing] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);

  const loadSummary = useCallback(async (signal) => {
    setSummaryState((s) => ({ loading: !s.error, error: false }));
    try {
      const data = await api.homeSummary();
      if (signal?.cancelled) return;
      setSummary(data);
      setSummaryState({ loading: false, error: false });
    } catch {
      // Live Render does not have /home-summary yet. Rebuild the same charts
      // from bills + visitors, which that API already serves.
      try {
        const [maint, vis] = await Promise.all([
          api.maintenance().catch(() => ({ bills: [], totalDue: 0 })),
          api.visitors().catch(() => ({ visitors: [] })),
        ]);
        if (signal?.cancelled) return;
        setSummary(
          composeHomeSummary({
            role: user.role,
            bills: maint.bills || [],
            totalDue: maint.totalDue || 0,
            visitors: vis.visitors || [],
          })
        );
        setSummaryState({ loading: false, error: false });
      } catch {
        if (signal?.cancelled) return;
        setSummaryState({ loading: false, error: true });
      }
    }
  }, [user.role]);

  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      loadSummary(signal);
      return () => {
        signal.cancelled = true;
      };
    }, [loadSummary])
  );

  const refresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  };

  const L = labelsFor(user);
  const roleLabel = { resident: L.payer, admin: L.roleAdmin, guard: "Gate desk" }[user.role];
  const catalog = getActionGroups(user.role, L, isPreschool(user));
  const assistantOn = hasFeature(user, "assistant");

  // A tenant's branded image (set by the GATEZO owner) becomes the dashboard header
  // background. Fall back to the default themed photo if it's unset or the URL
  // fails to load (e.g. not a direct image link).
  const customBg = !!user.societyLogoUrl && !bgError;
  const defaultHero =
    Platform.OS === "web"
      ? isPreschool(user)
        ? WEB_PRESCHOOL
        : WEB_HERO
      : isPreschool(user)
        ? PRESCHOOL_HERO
        : HERO[user.role];
  const heroSource = customBg ? { uri: user.societyLogoUrl } : defaultHero;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 56, width: "100%", flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#0B6E8F" />}
    >
      <HeroBleed source={heroSource} height={236 + insets.top} onError={() => setBgError(true)}>
        <View style={styles.heroOverlay} />
        <View style={[styles.heroContent, { paddingTop: 26 + insets.top }]}>
          <View style={{ flex: 1 }}>
            {user.societyName ? (
              <View style={styles.brandRow}>
                <Image source={brandIcon} style={styles.brandLogo} resizeMode="cover" />
                <Text style={styles.brandName} numberOfLines={1}>{user.societyName}</Text>
              </View>
            ) : null}
            <View style={styles.greetBlock}>
              <Text style={styles.welcome}>{greeting()}</Text>
              <Text style={[styles.hi, compact && { fontSize: 22 }]} numberOfLines={2}>{user.name}</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="location-outline" size={12} color="#fff" />
              <Text style={styles.badgeText}>
                {user.flatNo ? `${L.unit} ${user.flatNo}` : roleLabel}
              </Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setProfileOpen(true)}>
              <Ionicons name="person-circle-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
              <Ionicons name="log-out-outline" size={16} color="#fff" />
              {compact ? null : <Text style={styles.logoutText}>Logout</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </HeroBleed>

      <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} />

      <View style={[styles.body, compact && { paddingHorizontal: 14 }]}>
        {assistantOn ? (
          <View style={styles.askWrap}>
            <AskGateMate navigation={navigation} />
          </View>
        ) : null}

        <HomeSummary
          data={summary}
          loading={summaryState.loading}
          navigation={navigation}
          labels={L}
        />

        {catalog.sos ? (
          <SosBanner
            {...catalog.sos}
            onPress={() => openScreen(navigation, catalog.sos.route, catalog.sos.params)}
          />
        ) : null}

        {catalog.groups.length ? (
          <Text style={styles.sectionLabel}>Shortcuts</Text>
        ) : null}
        {catalog.groups.map((group) => (
          <CategoryFolder
            key={group.title}
            group={group}
            open={openGroup === group.title}
            compact={compact}
            onToggle={() => setOpenGroup(openGroup === group.title ? null : group.title)}
            user={user}
            onOpen={(a, locked) =>
              locked
                ? Alert.alert(
                    `${requiredTierLabel(a.feature)} feature`,
                    `“${a.label}” is available on the ${requiredTierLabel(a.feature)} plan. Ask your ${brand.name} owner to upgrade your ${L.org.toLowerCase()}.`
                  )
                : openScreen(navigation, a.route, a.params)
            }
          />
        ))}

        {user.role === "resident" && !isPreschool(user) ? (
          <HomeServicesStrip navigation={navigation} />
        ) : null}

        <OffersRail slot="home" navigation={navigation} />
      </View>
    </ScrollView>
  );
}

function getActionGroups(role, L, preschool) {
  if (role === "resident") {
    if (preschool) {
      return {
        sos: { label: "Emergency SOS", subtitle: "Alert staff & nearby parents", icon: "alert-circle", route: "Community", params: { screen: "Sos" } },
        groups: [
          {
            title: "School",
            icon: "school",
            tint: "#6D3BD1",
            hint: "Child, fees & transparency",
            items: [
              { label: "My child", subtitle: "Today's updates & pickup passes", icon: "happy-outline", tint: "#6D3BD1", route: "Community", params: { screen: "Child" } },
              { label: `Pay ${L.feesShort.toLowerCase()}`, subtitle: "View bills & download receipts", icon: "card-outline", tint: "#0B6E8F", route: "Maintenance" },
              { label: "Transparency", subtitle: `See where ${L.fees.toLowerCase()} money goes`, icon: "shield-checkmark-outline", tint: "#1E7A3D", route: "Maintenance", params: { screen: "Transparency" } },
            ],
          },
          {
            title: "Help",
            icon: "help-buoy",
            tint: "#1E7A3D",
            hint: "Helpdesk & trusted helpers",
            items: [
              { label: "Helpdesk", subtitle: "Raise a request or call the office", icon: "help-buoy-outline", tint: "#1E7A3D", route: "Community", params: { screen: "Helpdesk" } },
              { label: "Help & how-to", subtitle: "How each feature works, with examples", icon: "book-outline", tint: "#0B6E8F", route: "Community", params: { screen: "Help" } },
              { label: "Trusted helpers", subtitle: "Rated tutors, nannies & services", icon: "ribbon-outline", tint: "#0B6E8F", route: "Community", params: { screen: "Workers" } },
            ],
          },
        ],
      };
    }
    return {
      sos: { label: "Emergency SOS", subtitle: "Alert guards & nearby neighbours", icon: "alert-circle", route: "Community", params: { screen: "Sos" } },
      groups: [
          {
            title: "At the gate",
            icon: "shield-checkmark",
            tint: "#C2571A",
            hint: "Visitors, gate pass, vehicles",
            items: [
            { label: "Visitors at gate", subtitle: "Approve, deny or leave at gate", icon: "people-outline", tint: "#C2571A", route: "Visitors" },
            { label: "Gate pass", subtitle: "Pre-approve guests & deliveries", icon: "qr-code-outline", tint: "#7A5AF8", route: "Visitors", params: { screen: "GatePass" }, feature: "gatepass" },
            { label: "Vehicle passes", subtitle: "Register vehicles & print gate QR", icon: "car-sport-outline", tint: "#0B6E8F", route: "Visitors", params: { screen: "Vehicles" }, feature: "vehicleqr" },
          ],
        },
          {
            title: "Bills & bookings",
            icon: "wallet-outline",
            tint: "#0B6E8F",
            hint: "Pay dues & book the clubhouse",
            items: [
            { label: `Pay ${L.feesShort.toLowerCase()}`, subtitle: "View bills & download receipts", icon: "card-outline", tint: "#0B6E8F", route: "Maintenance" },
            { label: "Book clubhouse", subtitle: "Hall, party slot & amenities", icon: "calendar-outline", tint: "#0B6E8F", route: "Community", params: { screen: "Amenities" } },
          ],
        },
        {
          title: "Your society",
          icon: "leaf",
          tint: "#1E7A3D",
          hint: "Books, green score & AGM",
          items: [
            { label: "Transparency", subtitle: `See where ${L.fees.toLowerCase()} money goes`, icon: "shield-checkmark-outline", tint: "#1E7A3D", route: "Maintenance", params: { screen: "Transparency" } },
            { label: "Sustainability", subtitle: "Your green score & water use", icon: "leaf-outline", tint: "#1E7A3D", route: "Maintenance", params: { screen: "Sustainability" } },
            { label: "AGM & voting", subtitle: "Vote on motions & read minutes", icon: "people-outline", tint: "#6D3BD1", route: "Community", params: { screen: "Agm" } },
          ],
        },
        {
          title: "Community",
          icon: "people-circle",
          tint: "#6D3BD1",
          hint: "Home services, helpdesk & market",
          items: [
            { label: "Home services", subtitle: "Cleaning, AC, painting, movers & legal", icon: "construct-outline", tint: "#0B6E8F", route: "Community", params: { screen: "HomeServices" } },
            { label: "Helpdesk", subtitle: "Raise a ticket, call security or office", icon: "help-buoy-outline", tint: "#1E7A3D", route: "Community", params: { screen: "Helpdesk" } },
            { label: "Community market", subtitle: "Buy, sell, borrow, skills & group-buy", icon: "pricetags-outline", tint: "#C99000", route: "Community", params: { screen: "Marketplace" }, feature: "marketplace" },
            { label: "Trusted helpers", subtitle: "Rated maids, vendors & services", icon: "ribbon-outline", tint: "#0B6E8F", route: "Community", params: { screen: "Workers" } },
            { label: "Help & how-to", subtitle: "How each feature works, with examples", icon: "book-outline", tint: "#0B6E8F", route: "Community", params: { screen: "Help" } },
          ],
        },
      ],
    };
  }
  if (role === "admin") {
    const run = [
      { label: preschool ? "School manager" : "Society manager", subtitle: "AI insights, alerts & draft notices", icon: "bulb-outline", tint: "#6D3BD1", route: "Finance", params: { screen: "Manager" } },
      { label: preschool ? "Fees & collections" : "Finances & dues", subtitle: preschool ? "Balance, fees & reminders" : "Balance, collections & reminders", icon: "stats-chart-outline", tint: "#0B6E8F", route: "Finance" },
      { label: L.manageTile, subtitle: L.manageTileSub, icon: "people-circle-outline", tint: "#2E9E52", route: "Members" },
    ];
    if (preschool) {
      run.splice(1, 0, {
        label: "Student fees",
        subtitle: "Track paid/pending & send reminders",
        icon: "cash-outline",
        tint: "#1E7A3D",
        route: "Finance",
        params: { screen: "StudentFees" },
      });
      run.splice(1, 0, { label: "Pickups & updates", subtitle: "Post updates, manage pickup passes", icon: "happy-outline", tint: "#6D3BD1", route: "Community", params: { screen: "Child" } });
    }
    const gate = [
      { label: "Gate log", subtitle: L.gateAdminSub, icon: "shield-checkmark-outline", tint: "#C2571A", route: "Visitors" },
    ];
    if (!preschool) {
      gate.push({ label: "Vehicle gate", subtitle: "Vehicle QR registry & scanners", icon: "car-sport-outline", tint: "#0B6E8F", route: "Members", params: { screen: "Vehicles" }, feature: "vehicleqr" });
    }
    if (preschool) {
      gate.push({ label: "Staff attendance", subtitle: "Teacher & staff check-in/out", icon: "id-card-outline", tint: "#7A5AC2", route: "Staff" });
    }
    const ops = [
      { label: "Help & how-to", subtitle: "How each feature works, with examples", icon: "book-outline", tint: "#0B6E8F", route: "Community", params: { screen: "Help" } },
      { label: "Helpdesk", subtitle: `${L.payer} tickets & requests`, icon: "help-buoy-outline", tint: "#1E7A3D", route: "Community", params: { screen: "Helpdesk" } },
      { label: "Your plan", subtitle: "See what your package includes", icon: "pricetags-outline", tint: "#C99000", route: "Members", params: { screen: "Plans" } },
    ];
    if (!preschool) {
      ops.unshift({ label: "Home services", subtitle: "Resident bookings for cleaning & trades", icon: "construct-outline", tint: "#0B6E8F", route: "Community", params: { screen: "HomeServices" } });
      ops.push({ label: "Assets & AMC", subtitle: "Lifts, pumps, DG, fire & service due", icon: "build-outline", tint: "#0B6E8F", route: "Finance", params: { screen: "Assets" } });
      ops.push({ label: "AGM & voting", subtitle: "Motions, e-voting & minutes", icon: "people-outline", tint: "#6D3BD1", route: "Finance", params: { screen: "Agm" } });
      ops.push({ label: "Rental compliance", subtitle: "Verification, checklists & deposits", icon: "document-text-outline", tint: "#B4620A", route: "Finance", params: { screen: "RentalCompliance" } });
      ops.push({ label: "Sustainability", subtitle: "Green score & water metering", icon: "leaf-outline", tint: "#1E7A3D", route: "Finance", params: { screen: "Sustainability" } });
    } else {
      ops.push({ label: "School assets", subtitle: "Rooms, kits & service due dates", icon: "build-outline", tint: "#0B6E8F", route: "Finance", params: { screen: "Assets" } });
    }
    return {
      sos: { label: "Emergency SOS", subtitle: "See & manage active alerts", icon: "alert-circle", route: "Community", params: { screen: "Sos" } },
      groups: [
        { title: preschool ? "Run the school" : "Run the society", icon: "briefcase", tint: "#0B6E8F", hint: "Manager, finances, members", items: run },
        { title: "Gate", icon: "shield-checkmark", tint: "#C2571A", hint: preschool ? "Log, pickups & staff" : "Log, vehicles & staff", items: gate },
        { title: "Operations", icon: "construct", tint: "#1E7A3D", hint: preschool ? "Helpdesk & school assets" : "Helpdesk, assets & compliance", items: ops },
      ],
    };
  }
  const gate = [
    { label: "Log a new visitor", subtitle: `Photo, ${L.unit.toLowerCase()} & purpose in seconds`, icon: "person-add-outline", tint: "#0B6E8F", route: "Gate" },
    { label: "View gate log", subtitle: "Today's entries & their status", icon: "list-outline", tint: "#C2571A", route: "Visitors" },
    { label: "Help & how-to", subtitle: "How each feature works, with examples", icon: "book-outline", tint: "#0B6E8F", route: "Community", params: { screen: "Help" } },
  ];
  if (preschool) {
    gate.splice(1, 0, { label: "Child pickup", subtitle: "Scan pass & log pickup/drop", icon: "qr-code-outline", tint: "#6D3BD1", route: "Community", params: { screen: "Pickup" } });
    gate.push({ label: "Staff attendance", subtitle: "Teacher & staff check-in/out", icon: "id-card-outline", tint: "#7A5AC2", route: "Staff" });
  }
  return {
    sos: { label: "Emergency SOS", subtitle: "Respond to active alerts", icon: "alert-circle", route: "Community", params: { screen: "Sos" } },
    groups: [{ title: "Gate desk", icon: "log-in", tint: "#0B6E8F", hint: "Log visitors & today's entries", items: gate }],
  };
}

function SosBanner({ label, subtitle, onPress }) {
  return (
    <TouchableOpacity style={styles.sos} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.sosIcon}>
        <Ionicons name="alert-circle" size={22} color="#B42318" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sosTitle}>{label}</Text>
        <Text style={styles.sosSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#B42318" />
    </TouchableOpacity>
  );
}

function CategoryFolder({ group, open, onToggle, user, onOpen, compact }) {
  const tint = group.tint || "#0B6E8F";
  return (
    <View style={[styles.folder, open && styles.folderOpen]}>
      <TouchableOpacity style={styles.folderHead} onPress={onToggle} activeOpacity={0.85}>
        <View style={[styles.folderMark, { backgroundColor: `${tint}18` }]}>
          <Ionicons name={group.icon || "apps"} size={22} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.folderTitle}>{group.title}</Text>
          <Text style={styles.folderHint}>
            {open ? `${group.items.length} options` : group.hint || "Tap to see options"}
          </Text>
        </View>
        <View style={[styles.chevron, open && { backgroundColor: `${tint}18` }]}>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={tint} />
        </View>
      </TouchableOpacity>
      {open ? (
        <View style={styles.optionGrid}>
          {group.items.map((a) => {
            const locked = a.feature && !hasFeature(user, a.feature);
            return (
              <TouchableOpacity
                key={a.label}
                style={[styles.optionCard, compact && styles.optionCardFull]}
                onPress={() => onOpen(a, locked)}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIcon, { backgroundColor: `${(locked ? "#9AA7AF" : tint)}1F` }]}>
                  <Ionicons name={locked ? "lock-closed" : a.icon} size={18} color={locked ? "#9AA7AF" : tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, locked && { color: "#8895A0" }]}>
                    {a.label}
                  </Text>
                  {a.subtitle ? (
                    <Text style={styles.optionSub} numberOfLines={2}>
                      {a.subtitle}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// A greeting that tracks the clock reads as a live app rather than a static one.
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },

  hero: { height: 210, justifyContent: "flex-start" },
  heroImg: { resizeMode: "cover" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6, 40, 52, 0.55)" },
  heroContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 22,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  brandLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  brandLogoFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.22)" },
  brandLogoInitial: { color: "#fff", ...body(800), fontSize: 15 },
  brandName: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    ...head(800),
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  // Dark translucent panel behind the greeting so white text stays readable over
  // ANY background image — including busy, bright preschool artwork.
  greetBlock: {
    alignSelf: "flex-start",
    maxWidth: "94%",
    backgroundColor: "rgba(5,28,36,0.48)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  welcome: {
    color: "#EAF4F8",
    fontSize: 13,
    ...head(600),
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  hi: {
    color: "#fff",
    fontSize: 26,
    ...head(800),
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: { color: "#fff", fontSize: 12, ...body(700) },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  logoutText: { color: "#fff", ...body(700), fontSize: 13 },
  body: { paddingHorizontal: 20, paddingTop: 12 },
  askWrap: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 12,
    color: "#6B7B85",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4,
    ...body(700),
  },
  sos: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FDF2F0",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F4D4CE",
  },
  sosIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#FBE7E4",
    alignItems: "center",
    justifyContent: "center",
  },
  sosTitle: { fontSize: 15, ...head(800), color: "#B42318" },
  sosSub: { fontSize: 12, color: "#8A4A43", marginTop: 2, ...body(400) },
  folder: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E6EEF2",
    overflow: "hidden",
  },
  folderOpen: { borderColor: "#C5D9E2" },
  folderHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  folderMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  folderTitle: { fontSize: 15.5, ...head(800), color: "#1B2B33" },
  folderHint: { fontSize: 12, color: "#6B7B85", marginTop: 2, ...body(400) },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F5F7",
    alignItems: "center",
    justifyContent: "center",
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 12,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F7",
  },
  optionCard: {
    width: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F7FAFB",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E6EEF2",
  },
  optionCardFull: { width: "100%", flexGrow: 0 },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { fontSize: 13, lineHeight: 18, ...head(700), color: "#1B2B33" },
  optionSub: { fontSize: 11, color: "#6B7B85", marginTop: 2, lineHeight: 14, ...body(400) },
});
