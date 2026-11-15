import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { UserRoundPlus, X } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function GroupJoinRequest({
  pending,
  busy,
  onRequest,
  onCancel,
}: {
  pending: boolean;
  busy: boolean;
  onRequest: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [accent, danger] = useThemeColor(["accent-foreground", "danger"]);
  return (
    <View
      style={{
        alignSelf: "center",
        alignItems: "center",
        width: "100%",
        maxWidth: 420,
        marginTop: 16,
        gap: 12,
      }}
    >
      {pending ? (
        <Typography className="text-muted" style={{ textAlign: "center" }}>
          {t(
            "Membership pending. Events, rankings and group social actions are unavailable until acceptance.",
          )}
        </Typography>
      ) : null}
      <Button
        isDisabled={busy}
        variant={pending ? "danger-soft" : "primary"}
        onPress={pending ? onCancel : onRequest}
      >
        {pending ? <X size={18} color={danger} /> : <UserRoundPlus size={18} color={accent} />}
        <Button.Label>{pending ? t("Cancel request") : t("Request membership")}</Button.Label>
      </Button>
    </View>
  );
}
