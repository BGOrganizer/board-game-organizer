import { getBgoRole, getMobileNumber } from "@board-game-organizer/schemas";
import { useAuth, useUser } from "@clerk/expo";
import { Redirect, Tabs, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import {
  CalendarDays,
  ContactRound,
  Dices,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react-native";
import { Platform, View } from "react-native";

import { HeaderTitle } from "@/components/HeaderTitle";
import { NotificationBell } from "@/components/NotificationBell";
import { useT } from "@/lib/i18n";

export default function TabLayout() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: isUserLoaded, user } = useUser();
  const t = useT();
  const router = useRouter();

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
        headerRight: () => (
          <View style={{ marginRight: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <NotificationBell />
            {getBgoRole(user?.publicMetadata) === "ADMIN" ? (
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                accessibilityLabel={t("Organization moderation")}
                style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => router.push("/moderation")}
              >
                <ShieldCheck size={20} color="#737373" />
              </Button>
            ) : null}
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              accessibilityLabel={t("Profile")}
              testID="profile-button"
              style={{ minHeight: 36, minWidth: 36 }}
              onPress={() => router.push("/profile")}
            >
              <UserRound size={20} color="#737373" />
            </Button>
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="matches"
        options={{
          title: t("Matches"),
          headerTitle: () => <HeaderTitle title={t("Matches")} icon={Dices} />,
          tabBarIcon: ({ color }) => <Dices size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: t("Groups and organizations"),
          headerTitle: () => (
            <HeaderTitle title={t("Groups and organizations")} icon={UsersRound} />
          ),
          tabBarIcon: ({ color }) => <UsersRound size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: t("Events"),
          headerTitle: () => <HeaderTitle title={t("Events")} icon={CalendarDays} />,
          tabBarIcon: ({ color }) => <CalendarDays size={26} color={color} />,
        }}
      />
      <Tabs.Screen name="organizations" options={{ href: null }} />
      <Tabs.Screen
        name="contacts"
        options={{
          title: t("Contacts"),
          headerTitle: () => <HeaderTitle title={t("Contacts")} icon={ContactRound} />,
          tabBarIcon: ({ color }) => <ContactRound size={26} color={color} />,
        }}
      />
    </Tabs>
  );
}
