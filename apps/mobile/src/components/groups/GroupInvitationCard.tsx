import { notificationItemId } from "@board-game-organizer/schemas";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, X } from "lucide-react-native";
import { View } from "react-native";
import { ListCard } from "@/components/common/ui/ListCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useT } from "@/lib/i18n";
export function GroupInvitationCard({
  groupId,
  busy,
  onAccept,
  onDecline,
}: {
  groupId: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useT(),
    [accent, danger] = useThemeColor(["accent-foreground", "danger"]);
  return (
    <View style={{ alignSelf: "center", width: "100%", maxWidth: 420, marginTop: 16 }}>
      <ListCard>
        <View style={{ padding: 16, gap: 12 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Typography
              accessibilityRole="header"
              className="text-center font-semibold text-foreground"
              style={{ flexShrink: 1 }}
            >
              {t("Invitation received")}
            </Typography>
            <NotificationItem itemId={notificationItemId(groupId, "invitation")} />
          </View>
          <Typography className="text-center text-sm text-muted">
            {t(
              "Membership pending. Events, rankings and group social actions are unavailable until acceptance.",
            )}
          </Typography>
          <View
            style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 8 }}
          >
            <Button variant="primary" isDisabled={busy} onPress={onAccept}>
              <Check size={18} color={accent} />
              <Button.Label>{t("Accept")}</Button.Label>
            </Button>
            <Button variant="danger-soft" isDisabled={busy} onPress={onDecline}>
              <X size={18} color={danger} />
              <Button.Label>{t("Decline")}</Button.Label>
            </Button>
          </View>
        </View>
      </ListCard>
    </View>
  );
}
