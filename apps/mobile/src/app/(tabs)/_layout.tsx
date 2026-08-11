import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Tabs } from "expo-router";
import { useEffect } from "react";

import { Spinner } from "heroui-native/spinner";
import { View } from "react-native";

/**
 * Guard: the tabs are only reachable when authenticated. After sign-out the
 * Clerk state flips and this layout redirects back to the welcome screen.
 * Uses router.replace in an effect (NOT a rendered <Redirect>, which caused a
 * "Maximum update depth" render loop during auth transitions).
 */
export default function TabLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner color="accent" />
      </View>
    );
  }

  if (!isSignedIn) {
    return null; // the effect above navigates back to the welcome screen
  }

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#006fee" }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Matches",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="home" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="users" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="organizations"
        options={{
          title: "Organizations",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="cog" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="address-book" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="user" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
