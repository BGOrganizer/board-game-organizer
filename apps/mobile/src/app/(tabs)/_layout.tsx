import { getBgoRole, getMobileNumber } from "@board-game-organizer/schemas";
import { useAuth, useUser } from "@clerk/expo";
import { Redirect, Tabs, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
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

import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { HEADER_ICON_SIZE, headerButtonProps } from "@/components/common/layout/headerStyles";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationNavigationBadge } from "@/components/notifications/NotificationNavigationBadge";
import { useT } from "@/lib/i18n";

export default function TabLayout() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: isUserLoaded, user } = useUser();
  const t = useT();
  const router = useRouter();
  const [foreground, muted] = useThemeColor(["foreground", "muted"]);

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
        tabBarInactiveTintColor: muted,
        animation: Platform.OS === "android" ? "none" : "fade",
        headerRight: () => (
          <View style={{ marginRight: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <NotificationBell />
            {getBgoRole(user?.publicMetadata) === "ADMIN" ? (
              <Button
                {...headerButtonProps}
                variant="ghost"
                accessibilityLabel={t("Group moderation")}
                onPress={() => router.push("/moderation")}
              >
                <ShieldCheck size={HEADER_ICON_SIZE} color={foreground} />
              </Button>
            ) : null}
            <Button
              {...headerButtonProps}
              variant="ghost"
              accessibilityLabel={t("Profile")}
              testID="profile-button"
              onPress={() => router.push("/profile")}
            >
              <UserRound size={HEADER_ICON_SIZE} color={foreground} />
            </Button>
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="tables"
        options={{
          title: t("Tables"),
          headerTitle: () => <HeaderTitle title={t("Tables")} icon={Dices} />,
          tabBarIcon: ({ color }) => (
            <View style={{ position: "relative" }}>
              <Dices size={26} color={color} />
              <NotificationNavigationBadge section="tables" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: t("Events"),
          headerTitle: () => <HeaderTitle title={t("Events")} icon={CalendarDays} />,
          tabBarIcon: ({ color }) => (
            <View style={{ position: "relative" }}>
              <CalendarDays size={26} color={color} />
              <NotificationNavigationBadge section="events" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: t("Groups"),
          headerTitle: () => <HeaderTitle title={t("Groups")} icon={UsersRound} />,
          tabBarIcon: ({ color }) => (
            <View style={{ position: "relative" }}>
              <UsersRound size={26} color={color} />
              <NotificationNavigationBadge section="groups" />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="organizations" options={{ href: null }} />
      <Tabs.Screen name="matches" options={{ href: null }} />
      <Tabs.Screen
        name="contacts"
        options={{
          title: t("Contacts"),
          headerTitle: () => <HeaderTitle title={t("Contacts")} icon={ContactRound} />,
          tabBarIcon: ({ color }) => (
            <View style={{ position: "relative" }}>
              <ContactRound size={26} color={color} />
              <NotificationNavigationBadge section="contacts" />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
