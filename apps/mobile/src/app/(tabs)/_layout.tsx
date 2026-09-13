import { getMobileNumber } from "@board-game-organizer/schemas";
import { useAuth, useUser } from "@clerk/expo";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Redirect, Tabs } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { Platform, View } from "react-native";

import { useT } from "@/lib/i18n";

export default function TabLayout() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: isUserLoaded, user } = useUser();
  const t = useT();

  if (!isAuthLoaded || (isSignedIn && !isUserLoaded)) {
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
        <Skeleton isLoading variant="pulse" style={{ width: 192, height: 32, borderRadius: 8 }} />
        <Skeleton isLoading variant="pulse" style={{ width: "80%", height: 16, borderRadius: 4 }} />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/" />;
  if (!getMobileNumber(user?.unsafeMetadata)) return <Redirect href="/mobile-number" />;

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
