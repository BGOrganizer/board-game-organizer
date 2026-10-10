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
  actionsInRow = false,
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
  actionsInRow?: boolean;
  cancelIcon?: ReactNode;
}) {
  const t = useT();
  const buttonStyle = actionsInRow
    ? {
        flex: 1,
        minWidth: 44,
        minHeight: 64,
        paddingHorizontal: 4,
        flexDirection: "column" as const,
        gap: 4,
      }
    : undefined;
  const labelStyle = actionsInRow
    ? { textAlign: "center" as const, alignSelf: "stretch" as const }
    : undefined;
  const cancel = (
    <Button variant="ghost" style={buttonStyle} isDisabled={busy} onPress={onCancel}>
      {cancelIcon}
      <Button.Label style={labelStyle}>{t("Cancel")}</Button.Label>
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
              flexDirection: cancelLast && !actionsInRow ? "column" : "row",
              flexWrap: actionsInRow ? "nowrap" : "wrap",
              justifyContent: "flex-end",
              gap: actionsInRow ? 4 : 12,
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
                style={buttonStyle}
                isDisabled={busy}
                onPress={action.onPress}
              >
                {action.icon}
                <Button.Label style={labelStyle}>{action.label}</Button.Label>
              </Button>
            ))}
            {cancelLast ? cancel : null}
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
