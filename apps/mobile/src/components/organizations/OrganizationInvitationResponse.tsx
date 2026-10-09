import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Check, ClipboardCheck, X } from "lucide-react-native";
import { useState } from "react";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { useT } from "@/lib/i18n";

export function OrganizationInvitationResponse({
  busy,
  onAction,
}: {
  busy: boolean;
  onAction: (action: "accept" | "decline") => void;
}) {
  const t = useT();
  const [foreground, accentForeground] = useThemeColor(["foreground", "accent-foreground"]);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        isIconOnly
        accessibilityLabel={t("Respond to organization invitation")}
        isDisabled={busy}
        style={{ minWidth: 44, minHeight: 44 }}
        onPress={() => setOpen(true)}
      >
        <ClipboardCheck size={18} color={accentForeground} />
      </Button>
      {open ? (
        <CommunityConfirm
          title={t("Respond to organization invitation")}
          description={t("Accept or reject this organization invitation.")}
          busy={busy}
          cancelLast
          cancelIcon={<X size={18} color={foreground} />}
          onCancel={() => {
            if (!busy) setOpen(false);
          }}
          actions={[
            {
              label: t("Accept"),
              icon: <Check size={18} color={accentForeground} />,
              variant: "primary",
              onPress: () => {
                onAction("accept");
                setOpen(false);
              },
            },
            {
              label: t("Reject"),
              icon: <X size={18} color={accentForeground} />,
              variant: "danger",
              onPress: () => {
                onAction("decline");
                setOpen(false);
              },
            },
          ]}
        />
      ) : null}
    </>
  );
}
