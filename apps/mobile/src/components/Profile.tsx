import { resolveApiUrl, useBggAccount, useProfileQuery } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Spinner } from "heroui-native/spinner";
import { Surface } from "heroui-native/surface";
import { Typography } from "heroui-native/text";
import {
  Crown,
  Dices,
  Link2,
  LogOut,
  type LucideIcon,
  RefreshCw,
  Unlink2,
  UserCheck,
  UserPlus,
  UsersRound,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import { Alert, Image, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

function Stat({
  Icon,
  label,
  value,
  color,
}: {
  Icon: LucideIcon;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
      style={{ width: "31%", alignItems: "center", gap: 8 }}
    >
      <View style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}>
        <Icon size={32} color={color} accessible={false} />
        <View
          className="bg-accent"
          style={{
            position: "absolute",
            right: -3,
            bottom: -2,
            borderRadius: 11,
            minWidth: 22,
            paddingHorizontal: 4,
            height: 22,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography
            className="font-bold text-accent-foreground"
            style={{ fontSize: 11, lineHeight: 14, textAlign: "center", includeFontPadding: false }}
          >
            {value}
          </Typography>
        </View>
      </View>
      <Typography className="text-center text-xs text-muted">{label}</Typography>
    </View>
  );
}

function BggAttribution() {
  const t = useT();
  return (
    <View className="rounded-lg bg-white p-2" style={{ alignSelf: "center" }}>
      <Image
        source={require("../../assets/bgg-powered.png")}
        style={{ width: 230, height: 68 }}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel={t("Powered by BoardGameGeek")}
      />
    </View>
  );
}

export function Profile() {
  const { getToken, signOut, isLoaded, isSignedIn, userId } = useAuth();
  const t = useT();
  const feedback = useMutationFeedback();
  const accent = useThemeColor("accent");
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useProfileQuery({
    apiUrl: apiUrl(),
    getToken,
    userId,
    enabled: isLoaded && Boolean(isSignedIn),
  });
  const bgg = useBggAccount({
    apiUrl: apiUrl(),
    getToken,
    userId,
    enabled: isLoaded && Boolean(isSignedIn),
    feedback,
  });
  const handleLogout = useCallback(async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      router.replace("/");
    } catch {
      // Clerk keeps the session when sign-out fails.
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut, router]);

  const synchronize = async () => {
    if (!username.trim()) return;
    setFormError(null);
    try {
      await bgg.link.mutateAsync(username.trim());
      setDialogOpen(false);
      bgg.sync.mutate(false);
    } catch (cause) {
      setFormError(
        cause instanceof Error && cause.message === "BGG user not found"
          ? t("BGG user not found")
          : t("Could not connect to BoardGameGeek. Try again."),
      );
    }
  };

  if (isLoading) {
    return (
      <View style={{ marginTop: 16, gap: 12 }}>
        <Skeleton isLoading variant="pulse" style={{ width: 64, height: 64, borderRadius: 32 }} />
        <Skeleton
          isLoading
          variant="pulse"
          style={{ width: "100%", height: 140, borderRadius: 12 }}
        />
      </View>
    );
  }
  if (isError) {
    return (
      <Surface className="mt-4 flex-1 rounded-lg p-4">
        <Typography className="text-danger">
          {t("Error while loading the profile:")}{" "}
          {error instanceof Error ? error.message : String(error)}
        </Typography>
        <Button className="mt-3" variant="outline" onPress={() => refetch()}>
          {t("Retry")}
        </Button>
        <View style={{ marginTop: "auto", paddingTop: 32, width: "100%", gap: 24 }}>
          <BggAttribution />
          <Button
            style={{ width: "100%", justifyContent: "center", backgroundColor: "#b91c1c" }}
            variant="danger"
            isDisabled={isSigningOut}
            onPress={handleLogout}
          >
            <LogOut size={18} color="#fff" />
            <Typography className="text-white">{t("Logout")}</Typography>
          </Button>
        </View>
      </Surface>
    );
  }
  if (!profile) return null;
  const stats = [
    { label: t("Friends"), value: profile.stats.friends, Icon: UsersRound },
    { label: t("Followers"), value: profile.stats.followers, Icon: UserCheck },
    { label: t("Following"), value: profile.stats.following, Icon: UserPlus },
    { label: t("Matches played"), value: profile.stats.playedMatches, Icon: Dices },
    { label: t("Admin groups"), value: profile.stats.adminGroups, Icon: Crown },
    { label: t("Joined groups"), value: profile.stats.joinedGroups, Icon: UsersRound },
  ];
  const active = bgg.account.data?.active;
  const pending = bgg.account.data?.pending;
  const syncing = pending?.status === "syncing" ? pending : null;
  const shown = syncing ?? active;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
      <Surface className="mt-6 flex-1 rounded-xl p-6">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Avatar size="lg" color="accent">
            <Avatar.Image source={{ uri: profile.avatarUrl }} alt={profile.name} />
            <Avatar.Fallback>{profile.name?.charAt(0) ?? "?"}</Avatar.Fallback>
          </Avatar>
          <View style={{ flex: 1 }}>
            <Typography className="text-lg font-semibold" numberOfLines={1}>
              {profile.name}
            </Typography>
            <Typography className="text-sm text-muted" numberOfLines={1}>
              {profile.email}
            </Typography>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            flexWrap: "wrap",
            rowGap: 24,
            marginTop: 28,
          }}
        >
          {stats.map((stat) => (
            <Stat key={stat.label} {...stat} color={accent} />
          ))}
        </View>
        <Typography className="mt-6 text-xs text-muted">
          {t("Plan:")} {profile.plan} · {t("Language:")} {profile.preferredLanguage}
        </Typography>

        {!active && !syncing ? (
          <Button
            className="mt-6"
            variant="primary"
            onPress={() => {
              setUsername("");
              setFormError(null);
              setDialogOpen(true);
            }}
          >
            <RefreshCw size={18} color="#fff" />
            <Typography className="text-white">{t("Sync with BoardGameGeek")}</Typography>
          </Button>
        ) : null}
        {bgg.account.isError ? (
          <Button className="mt-3" variant="outline" onPress={() => void bgg.account.refetch()}>
            <Typography>{t("Could not load BoardGameGeek connection. Retry")}</Typography>
          </Button>
        ) : null}
        {shown ? (
          <View
            className={`mt-4 rounded-lg border border-border p-3${syncing ? " opacity-60" : ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            accessibilityState={{ busy: Boolean(syncing) }}
          >
            <Avatar size="md" color="accent">
              {shown.avatarUrl ? <Avatar.Image source={{ uri: shown.avatarUrl }} /> : null}
              <Avatar.Fallback>{shown.username.charAt(0).toUpperCase()}</Avatar.Fallback>
            </Avatar>
            <Typography
              className="font-medium text-foreground"
              style={{ flex: 1 }}
              numberOfLines={1}
            >
              {shown.username}
            </Typography>
            {syncing ? (
              <Spinner
                size="sm"
                color="default"
                accessibilityLabel={t("Syncing BoardGameGeek collection")}
              />
            ) : active ? (
              <Button
                isIconOnly
                size="sm"
                variant="danger-soft"
                style={{ minWidth: 44, minHeight: 44 }}
                accessibilityLabel={t("Disconnect BoardGameGeek")}
                onPress={() =>
                  Alert.alert(
                    t("Disconnect BoardGameGeek?"),
                    t(
                      "Synced collection games will be removed from your profile. Existing matches remain unchanged.",
                    ),
                    [
                      { text: t("Cancel"), style: "cancel" },
                      {
                        text: t("Disconnect"),
                        style: "destructive",
                        onPress: () => bgg.unlink.mutate(),
                      },
                    ],
                  )
                }
              >
                <Unlink2 size={18} color="#f31260" />
              </Button>
            ) : null}
          </View>
        ) : null}
        <View
          style={{
            marginTop: "auto",
            paddingTop: 32,
            width: "100%",
            gap: 24,
            alignItems: "center",
          }}
        >
          <BggAttribution />
          <Button
            style={{ width: "100%", justifyContent: "center", backgroundColor: "#b91c1c" }}
            variant="danger"
            isDisabled={isSigningOut}
            onPress={handleLogout}
          >
            <LogOut size={18} color="#fff" />
            <Typography className="text-white">{t("Logout")}</Typography>
          </Button>
        </View>
      </Surface>
      <Dialog isOpen={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>{t("Sync with BoardGameGeek")}</Dialog.Title>
            <Typography className="mt-4 text-foreground">{t("BGG username")}</Typography>
            <Input
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              maxLength={64}
              accessibilityLabel={t("BGG username")}
              placeholder={t("BGG username")}
            />
            {formError ? <Typography className="mt-2 text-danger">{formError}</Typography> : null}
            <View
              style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 24 }}
            >
              <Button
                variant="ghost"
                isDisabled={bgg.link.isPending}
                onPress={() => setDialogOpen(false)}
              >
                <Typography>{t("Cancel")}</Typography>
              </Button>
              <Button
                variant="primary"
                isDisabled={!username.trim() || bgg.link.isPending}
                onPress={() => void synchronize()}
              >
                <Link2 size={16} color="#fff" />
                <Typography className="text-white">{t("Sync")}</Typography>
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </ScrollView>
  );
}
