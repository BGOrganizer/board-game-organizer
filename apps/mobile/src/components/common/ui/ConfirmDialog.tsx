import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
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
  children,
}: {
  title: string;
  description: string;
  busy?: boolean;
  onCancel: () => void;
  actions: readonly ConfirmDialogAction[];
  cancelTestID?: string;
  children?: ReactNode;
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
        <Dialog.Content
          isSwipeable={!busy}
          testID="confirmation-dialog"
          style={{ maxHeight: "90%" }}
        >
          <Dialog.Close
            isDisabled={busy}
            accessibilityLabel={t("Cancel")}
            testID={cancelTestID}
            style={{ alignSelf: "flex-end", minWidth: 44, minHeight: 44 }}
          />
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: 8, marginBottom: 8 }}>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </View>
            {children ? <View style={{ gap: 12 }}>{children}</View> : null}
          </ScrollView>
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
