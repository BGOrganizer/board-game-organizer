import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Check, X } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function InvitationActions({
  placement,
  name,
  pending,
  onAccept,
  onDecline,
}: {
  placement: "card" | "detail";
  name?: string;
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useT();
  const success = useThemeColor("success");
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
        variant="outline"
        accessibilityLabel={label(t("Decline"))}
        style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
        hitSlop={4}
        isDisabled={pending}
        onPress={onDecline}
      >
        <X size={14} color="#6b7280" />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant={placement === "card" ? "outline" : "primary"}
        className={placement === "card" ? "bg-surface" : undefined}
        accessibilityLabel={label(t("Accept"))}
        style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
        hitSlop={4}
        isDisabled={pending}
        onPress={onAccept}
      >
        <Check size={14} color={placement === "card" ? success : "#fff"} />
      </Button>
    </View>
  );
}
