import { communityAccessDenied, type useBggAccount } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { RefreshCw, Unlink2, UserRoundPen } from "lucide-react-native";
import { useState } from "react";
import { Image, Linking, View } from "react-native";
import { ScopedTheme } from "uniwind";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { ListCard } from "@/components/common/ui/ListCard";
import { useT } from "@/lib/i18n";

export function ProfileBggCard({ bgg }: { bgg: ReturnType<typeof useBggAccount> }) {
  const t = useT();
  const [open, setOpen] = useState(false),
    [disconnect, setDisconnect] = useState(false),
    [username, setUsername] = useState("");
  const [accentForeground, danger, muted] = useThemeColor(["accent-foreground", "danger", "muted"]);
  const data = communityAccessDenied(bgg.account.error) ? undefined : bgg.account.data,
    active = data?.active;
  const busy =
    bgg.busy ||
    bgg.link.isPending ||
    bgg.sync.isPending ||
    bgg.unlink.isPending ||
    data?.pending?.status === "syncing";
  const failed =
    !busy &&
    (bgg.account.isError ||
      bgg.link.isError ||
      bgg.sync.isError ||
      bgg.unlink.isError ||
      data?.lastAttempt?.status === "error");
  const askUsername = () => {
    setUsername((current) => current || active?.username || "");
    setOpen(true);
  };
  return (
    <>
      <ListCard>
        <View style={{ padding: 16, gap: 12 }}>
          <Typography accessibilityRole="header" className="font-semibold text-foreground">
            {t("Your BGG collection")}
          </Typography>
          <Typography className="text-sm text-muted">
            {t("Link your BGG username to use your collection when choosing games.")}
          </Typography>
          {bgg.account.isPending && !data ? (
            <Skeleton style={{ width: "100%", height: 44, borderRadius: 8 }} />
          ) : null}
          {active ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Typography
                  className="font-medium text-foreground"
                  style={{ flex: 1 }}
                  numberOfLines={1}
                >
                  {active.username}
                </Typography>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={t("Change BGG username")}
                  isDisabled={busy}
                  onPress={askUsername}
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <UserRoundPen size={18} color={muted} accessible={false} />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  accessibilityLabel={t("Disconnect BoardGameGeek")}
                  isDisabled={busy}
                  onPress={() => setDisconnect(true)}
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <Unlink2 size={18} color={danger} accessible={false} />
                </Button>
              </View>
              <Typography className="text-xs text-muted">{t("Last successful sync")}</Typography>
              <DateTimeInfo startsAt={active.syncedAt} dateStyle="medium" />
            </>
          ) : null}
          {busy ? (
            <Typography className="text-sm text-muted">
              {t("Syncing BoardGameGeek collection")}
            </Typography>
          ) : data?.lastAttempt?.status === "success" ? (
            <Typography className="text-sm text-success">{t("Collection up to date")}</Typography>
          ) : null}
          {failed ? (
            <Typography accessibilityRole="alert" className="text-sm text-danger">
              {t("Could not synchronize BGG collection. Your previous collection is retained.")}
            </Typography>
          ) : null}
          <Button
            variant="primary"
            isDisabled={busy || bgg.account.isPending}
            onPress={() => {
              bgg.reset();
              if (active) bgg.link.mutate({ username: active.username, synchronize: true });
              else askUsername();
            }}
          >
            <RefreshCw size={18} color={accentForeground} accessible={false} />
            <Button.Label>{t("Sync collection")}</Button.Label>
          </Button>
          {bgg.account.isError ? (
            <Button variant="secondary" onPress={() => void bgg.account.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            accessibilityLabel={t("Powered by BGG — open BoardGameGeek")}
            onPress={() => void Linking.openURL("https://boardgamegeek.com")}
          >
            <ScopedTheme theme="light">
              <View className="rounded-lg bg-surface" style={{ padding: 8 }}>
                <Image
                  source={require("../../../assets/bgg-powered.png")}
                  style={{ width: 120, height: 40 }}
                  resizeMode="contain"
                  accessibilityLabel={t("Powered by BGG")}
                />
              </View>
            </ScopedTheme>
          </Button>
        </View>
      </ListCard>
      <Dialog isOpen={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>{t("BGG username")}</Dialog.Title>
            <View style={{ gap: 12, marginTop: 12 }}>
              <Input
                testID="profile-bgg-username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t("BGG username")}
                placeholder={t("BGG username")}
              />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="secondary" onPress={() => setOpen(false)}>
                  <Button.Label>{t("Cancel")}</Button.Label>
                </Button>
                <Button
                  testID="profile-bgg-sync"
                  variant="primary"
                  isDisabled={!username.trim() || busy}
                  onPress={() => {
                    bgg.reset();
                    bgg.link.mutate({ username: username.trim(), synchronize: true });
                    setOpen(false);
                  }}
                >
                  <Button.Label>{t("Sync collection")}</Button.Label>
                </Button>
              </View>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
      {disconnect ? (
        <ConfirmDialog
          title={t("Disconnect BoardGameGeek?")}
          description={t(
            "Synced collection games will be removed from your profile. Existing matches remain unchanged.",
          )}
          busy={busy}
          onCancel={() => setDisconnect(false)}
          actions={[
            {
              label: t("Disconnect"),
              variant: "danger",
              onPress: () => {
                bgg.reset();
                bgg.unlink.mutate();
                setDisconnect(false);
              },
            },
          ]}
        />
      ) : null}
    </>
  );
}
