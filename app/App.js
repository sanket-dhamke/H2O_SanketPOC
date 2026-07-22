import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";

import { AuthProvider, useAuth } from "./src/lib/auth";
import { registerForPushNotifications } from "./src/lib/push";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import MaintenanceScreen from "./src/screens/MaintenanceScreen";
import VisitorsScreen from "./src/screens/VisitorsScreen";
import GateScreen from "./src/screens/GateScreen";
import AssistantScreen from "./src/screens/AssistantScreen";
import CommunityScreen from "./src/screens/CommunityScreen";
import AmenitiesScreen from "./src/screens/AmenitiesScreen";
import StaffAttendanceScreen from "./src/screens/StaffAttendanceScreen";
import { isPreschool, labelsFor } from "./src/lib/org";
import AdminDashboardScreen from "./src/screens/admin/AdminDashboardScreen";
import ManageUsersScreen from "./src/screens/admin/ManageUsersScreen";
import CreateAccountScreen from "./src/screens/admin/CreateAccountScreen";
import ManageFlatsScreen from "./src/screens/admin/ManageFlatsScreen";
import OnboardingScreen from "./src/screens/admin/OnboardingScreen";
import BankAccountScreen from "./src/screens/admin/BankAccountScreen";
import ReportsScreen from "./src/screens/admin/ReportsScreen";
import VenueMarketplaceScreen from "./src/screens/admin/VenueMarketplaceScreen";
import SuperAdminDashboardScreen from "./src/screens/superadmin/SuperAdminDashboardScreen";
import SocietiesScreen from "./src/screens/superadmin/SocietiesScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const MembersStack = createNativeStackNavigator();
const FinanceStack = createNativeStackNavigator();

const screenHeader = { headerStyle: { backgroundColor: "#0B6E8F" }, headerTintColor: "#fff" };

// Maps each tab route to an Ionicon (filled when active, outline otherwise).
const TAB_ICONS = {
  Home: "home",
  Maintenance: "card",
  Visitors: "people",
  Assistant: "sparkles",
  Finance: "stats-chart",
  Members: "people-circle",
  Gate: "person-add",
  Community: "megaphone",
  Amenities: "calendar",
  Staff: "id-card",
  Overview: "planet",
  Societies: "business",
};

const tabScreenOptions = ({ route }) => ({
  ...screenHeader,
  headerShown: false,
  tabBarActiveTintColor: "#0B6E8F",
  tabBarInactiveTintColor: "#93A2AB",
  tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginTop: -2 },
  tabBarItemStyle: { paddingHorizontal: 2 },
  tabBarAllowFontScaling: false,
  tabBarStyle: {
    backgroundColor: "#fff",
    borderTopWidth: 0,
    height: 68,
    paddingTop: 8,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  tabBarIcon: ({ color, size, focused }) => {
    const base = TAB_ICONS[route.name] || "ellipse";
    const name = focused ? base : `${base}-outline`;
    return <Ionicons name={name} size={size ?? 22} color={color} />;
  },
});

function MembersStackScreen() {
  return (
    <MembersStack.Navigator screenOptions={{ headerShown: false }}>
      <MembersStack.Screen name="ManageUsers" component={ManageUsersScreen} />
      <MembersStack.Screen name="CreateAccount" component={CreateAccountScreen} />
      <MembersStack.Screen name="ManageFlats" component={ManageFlatsScreen} />
      <MembersStack.Screen name="Onboarding" component={OnboardingScreen} />
      <MembersStack.Screen name="BankAccount" component={BankAccountScreen} />
    </MembersStack.Navigator>
  );
}

function FinanceStackScreen() {
  return (
    <FinanceStack.Navigator screenOptions={{ headerShown: false }}>
      <FinanceStack.Screen name="FinanceHome" component={AdminDashboardScreen} />
      <FinanceStack.Screen name="Collections" component={MaintenanceScreen} />
      <FinanceStack.Screen name="Amenities" component={AmenitiesScreen} />
      <FinanceStack.Screen name="Reports" component={ReportsScreen} />
      <FinanceStack.Screen name="VenueMarketplace" component={VenueMarketplaceScreen} />
    </FinanceStack.Navigator>
  );
}

function AdminTabs() {
  const { user } = useAuth();
  const preschool = isPreschool(user);
  const L = labelsFor(user);
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Finance" component={FinanceStackScreen} options={{ tabBarLabel: L.feesShort }} />
      <Tab.Screen name="Members" component={MembersStackScreen} options={{ headerShown: false, tabBarLabel: L.members }} />
      {preschool && <Tab.Screen name="Staff" component={StaffAttendanceScreen} />}
      <Tab.Screen name="Community" component={CommunityScreen} />
      <Tab.Screen name="Visitors" component={VisitorsScreen} options={{ title: L.gate }} />
      <Tab.Screen name="Assistant" component={AssistantScreen} />
    </Tab.Navigator>
  );
}

function ResidentTabs() {
  const { user } = useAuth();
  const L = labelsFor(user);
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Maintenance" component={MaintenanceScreen} options={{ tabBarLabel: L.feesShort }} />
      <Tab.Screen name="Community" component={CommunityScreen} />
      <Tab.Screen name="Amenities" component={AmenitiesScreen} />
      <Tab.Screen name="Visitors" component={VisitorsScreen} options={{ tabBarLabel: L.visitors }} />
      <Tab.Screen name="Assistant" component={AssistantScreen} />
    </Tab.Navigator>
  );
}

function SuperAdminTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Overview" component={SuperAdminDashboardScreen} />
      <Tab.Screen name="Societies" component={SocietiesScreen} />
    </Tab.Navigator>
  );
}

function GuardTabs() {
  const { user } = useAuth();
  const preschool = isPreschool(user);
  const L = labelsFor(user);
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Gate" component={GateScreen} />
      {preschool && <Tab.Screen name="Staff" component={StaffAttendanceScreen} />}
      <Tab.Screen name="Community" component={CommunityScreen} />
      <Tab.Screen name="Visitors" component={VisitorsScreen} options={{ title: L.gate }} />
      <Tab.Screen name="Assistant" component={AssistantScreen} />
    </Tab.Navigator>
  );
}

function AppInner() {
  const { user, loading } = useAuth();
  const navRef = useRef();

  useEffect(() => {
    if (!user) return;
    if (Platform.OS === "web") return; // Notifications API not available on web.
    registerForPushNotifications();
    // When a notification is tapped, jump to the Visitors screen.
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      navRef.current?.navigate("Visitors");
    });
    return () => sub.remove();
  }, [user]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0B6E8F" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
      <StatusBar style="light" />
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : user.role === "superadmin" ? (
        <SuperAdminTabs />
      ) : user.role === "resident" ? (
        <ResidentTabs />
      ) : user.role === "admin" ? (
        <AdminTabs />
      ) : (
        <GuardTabs />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F1F5F7" },
});
