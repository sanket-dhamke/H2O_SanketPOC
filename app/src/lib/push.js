import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Requests permission, gets the Expo push token, and registers it with the
// backend so this device can receive visitor / decision notifications.
export async function registerForPushNotifications() {
  if (Platform.OS === "web") return null; // No push in the browser preview.
  if (!Device.isDevice) return null; // Push only works on real devices.

  // Android REQUIRES a channel with high importance for a heads-up popup. The
  // channelId here must match the one the server sends on ("default").
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "GateMate alerts",
      importance: Notifications.AndroidImportance.MAX, // heads-up banner + sound
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0B6E8F",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  const token = (
    await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    )
  ).data;

  try {
    await api.registerPushToken(token);
  } catch {
    // Non-fatal: user can still use the app without push.
  }
  return token;
}
