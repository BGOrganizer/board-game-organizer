import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

type ConfirmDialogAction = {
  label: string;
  variant: "danger" | "danger-soft" | "primary";
  onPress: () => void;
  icon?: ReactNode;
  testID?: string;
};

export function ConfirmDialog({
  title,
  description,
  busy = false,
  onCancel,
  actions,
  cancelTestID = "confirmation-cancel",
}: {
  title: string;
  description: string;
  busy?: boolean;
  onCancel: () => void;
  actions: readonly ConfirmDialogAction[];
  cancelTestID?: string;
}) {
  const t = useT();
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <Dialog.Portal unstable_accessibilityContainerViewIsModal>
        <Dialog.Overlay isCloseOnPress={!busy} />
        <Dialog.Content isSwipeable={!busy} testID="confirmation-dialog">
          <Dialog.Close
            isDisabled={busy}
            accessibilityLabel={t("Cancel")}
            testID={cancelTestID}
            style={{ alignSelf: "flex-end", minWidth: 44, minHeight: 44 }}
          />
          <View style={{ gap: 8, marginBottom: 20 }}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
            {actions.map((action, index) => (
              <Button
                key={action.label}
                variant={action.variant}
                size="sm"
                style={{ minWidth: 44, minHeight: 44, flexShrink: 1 }}
                isDisabled={busy}
                testID={action.testID ?? `confirmation-action-${index}`}
                onPress={() => {
                  if (!busy) action.onPress();
                }}
              >
                {action.icon}
                <Button.Label style={{ textAlign: "center", flexShrink: 1 }}>
                  {action.label}
                </Button.Label>
              </Button>
            ))}
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
