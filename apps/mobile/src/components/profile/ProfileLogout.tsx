import { useAppStore } from "@board-game-organizer/store";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { LogOut } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { useMobileCache } from "@/lib/cache/mobileCacheContext";
import { useT } from "@/lib/i18n";
export function ProfileLogout() {
  const t = useT(),
    { signOut } = useAuth(),
    router = useRouter(),
    cache = useMobileCache(),
    dangerForeground = useThemeColor("danger-foreground");
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await cache.signOut(() => signOut());
      useAppStore.getState().clearProfileViews();
      router.replace("/");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      {failed ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {t("Could not sign out. Try again.")}
        </Typography>
      ) : null}
      <Button variant="danger" isDisabled={busy} onPress={() => setOpen(true)}>
        <LogOut size={18} color={dangerForeground} accessible={false} />
        <Button.Label>{t("Sign out of your account")}</Button.Label>
      </Button>
      {open ? (
        <ConfirmDialog
          title={t("Sign out of your account?")}
          description={t("You will need to sign in again to access your account.")}
          busy={busy}
          onCancel={() => setOpen(false)}
          actions={[{ label: t("Sign out"), variant: "danger", onPress: () => void run() }]}
        />
      ) : null}
    </View>
  );
}
