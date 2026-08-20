import { useAuth } from "@clerk/expo";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { useEffect } from "react";
import { Platform, View } from "react-native";

import { useT } from "@/lib/i18n";

/**
 * Guard: the tabs are only reachable when authenticated. After sign-out the
 * Clerk state flips and this layout redirects back to the welcome screen.
 * Uses router.replace in an effect (NOT a rendered <Redirect>); the pathname
 * check prevents a ping-pong with the index screen's guard while Clerk's auth
 * state settles.
 */
export default function TabLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoaded && !isSignedIn && pathname !== "/") {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router, pathname]);

  if (!isLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          backgroundColor: "transparent",
        }}
      >
        <Skeleton isLoading variant="pulse" style={{ width: 192, height: 48, borderRadius: 8 }} />
        <Skeleton isLoading variant="pulse" style={{ width: 128, height: 16, borderRadius: 4 }} />
      </View>
    );
  }

  if (!isSignedIn) {
    return null; // the effect above navigates back to the welcome screen
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#006fee",
        animation: Platform.OS === "android" ? "none" : "fade",
      }}
    >
      <Tabs.Screen
        name="matches"
        options={{
          title: t("Matches"),
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: t("Groups"),
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="organizations"
        options={{
          title: t("Organizations"),
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="cog" color={color} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: t("Contacts"),
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="address-book" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("Profile"),
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
