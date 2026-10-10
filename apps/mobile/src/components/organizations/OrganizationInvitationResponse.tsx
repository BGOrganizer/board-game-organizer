import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Check, ClipboardCheck, X } from "lucide-react-native";
import { useState } from "react";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { useT } from "@/lib/i18n";

export function OrganizationInvitationResponse({
  busy,
  onAction,
  presentation = "response",
}: {
  busy: boolean;
  presentation?: "response" | "choices";
  onAction: (action: "accept" | "decline") => void;
}) {
  const t = useT();
  const [foreground, accentForeground, danger] = useThemeColor([
    "foreground",
    "accent-foreground",
    "danger",
  ]);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"accept" | "decline" | null>(null);
  return (
    <>
      {presentation === "choices" ? (
        <>
          <Button
            isIconOnly
            accessibilityLabel={t("Accept organization invitation")}
            isDisabled={busy}
            style={{ minWidth: 44, minHeight: 44 }}
            onPress={() => {
              setChoice("accept");
              setOpen(true);
            }}
          >
            <Check size={18} color={accentForeground} />
          </Button>
          <Button
            isIconOnly
            variant="danger-soft"
            accessibilityLabel={t("Reject organization invitation")}
            isDisabled={busy}
            style={{ minWidth: 44, minHeight: 44 }}
            onPress={() => {
              setChoice("decline");
              setOpen(true);
            }}
          >
            <X size={18} color={danger} />
          </Button>
        </>
      ) : (
        <Button
          isIconOnly
          accessibilityLabel={t("Respond to organization invitation")}
          isDisabled={busy}
          style={{ minWidth: 44, minHeight: 44 }}
          onPress={() => {
            setChoice(null);
            setOpen(true);
          }}
        >
          <ClipboardCheck size={18} color={accentForeground} />
        </Button>
      )}
      {open ? (
        <CommunityConfirm
          title={
            choice === "accept"
              ? t("Accept organization invitation")
              : choice === "decline"
                ? t("Reject organization invitation")
                : t("Respond to organization invitation")
          }
          description={
            choice ? t("Are you sure?") : t("Accept or reject this organization invitation.")
          }
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
              variant: "primary" as const,
              onPress: () => {
                onAction("accept");
                setOpen(false);
              },
            },
            {
              label: t("Reject"),
              icon: <X size={18} color={accentForeground} />,
              variant: "danger" as const,
              onPress: () => {
                onAction("decline");
                setOpen(false);
              },
            },
          ].filter((_action, index) => choice === null || index === (choice === "accept" ? 0 : 1))}
        />
      ) : null}
    </>
  );
}
