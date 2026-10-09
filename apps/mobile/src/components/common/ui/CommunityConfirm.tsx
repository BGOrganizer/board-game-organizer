import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
export function CommunityConfirm({
  title,
  description,
  busy,
  onConfirm,
  onCancel,
  actions,
  cancelLast = false,
  cancelIcon,
}: {
  title: string;
  description: string;
  busy: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
  actions?: {
    label: string;
    variant: "danger" | "primary";
    onPress: () => void;
    icon?: ReactNode;
  }[];
  cancelLast?: boolean;
  cancelIcon?: ReactNode;
}) {
  const t = useT();
  const cancel = (
    <Button variant="ghost" isDisabled={busy} onPress={onCancel}>
      {cancelIcon}
      <Button.Label>{t("Cancel")}</Button.Label>
    </Button>
  );
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <View style={{ gap: 8, marginBottom: 20 }}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
          </View>
          <View
            style={{
              flexDirection: cancelLast ? "column" : "row",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            {!cancelLast ? cancel : null}
            {(
              actions ??
              (onConfirm
                ? [
                    {
                      label: title,
                      variant: "danger" as const,
                      onPress: onConfirm,
                      icon: undefined,
                    },
                  ]
                : [])
            ).map((action) => (
              <Button
                key={action.label}
                variant={action.variant}
                isDisabled={busy}
                onPress={action.onPress}
              >
                {action.icon}
                <Button.Label>{action.label}</Button.Label>
              </Button>
            ))}
            {cancelLast ? cancel : null}
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
