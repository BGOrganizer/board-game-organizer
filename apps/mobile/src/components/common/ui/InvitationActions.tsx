import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Check, X } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function InvitationActions({
  placement,
  name,
  acceptLabel,
  declineLabel,
  pending,
  onAccept,
  onDecline,
}: {
  placement: "card" | "detail";
  name?: string;
  acceptLabel?: string;
  declineLabel?: string;
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useT();
  const [accentForeground, dangerForeground] = useThemeColor([
    "accent-foreground",
    "danger-soft-foreground",
  ]);
  const label = (action: string) => (name ? `${action}: ${name}` : action);
  return (
    <View
      style={
        placement === "detail"
          ? { position: "absolute", right: 8, bottom: 8, flexDirection: "row", gap: 8 }
          : { flexDirection: "row", gap: 8 }
      }
    >
      <Button
        isIconOnly
        size="sm"
        variant="danger-soft"
        accessibilityLabel={label(declineLabel ?? t("Decline"))}
        style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
        hitSlop={4}
        isDisabled={pending}
        onPress={onDecline}
      >
        <X size={14} color={dangerForeground} accessible={false} />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="primary"
        accessibilityLabel={label(acceptLabel ?? t("Accept"))}
        style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
        hitSlop={4}
        isDisabled={pending}
        onPress={onAccept}
      >
        <Check size={14} color={accentForeground} accessible={false} />
      </Button>
    </View>
  );
}
