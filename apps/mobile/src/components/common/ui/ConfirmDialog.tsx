import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useT } from "@/lib/i18n";
import { InputFieldContext, InputScrollContext } from "@/lib/inputScrollContext";
import { FormInteractionScope } from "./FormInteractionScope";
import { FormSubmitButton } from "./FormSubmitButton";

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
        <KeyboardAvoidingView
          pointerEvents="box-none"
          style={{ flex: 1, justifyContent: "center" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <FormInteractionScope>
            <InputScrollContext.Provider value={null}>
              <InputFieldContext.Provider value={null}>
                <Dialog.Content
                  isSwipeable={false}
                  testID="confirmation-dialog"
                  style={{ flexShrink: 0 }}
                >
                  <Dialog.Close
                    isDisabled={busy}
                    accessibilityLabel={t("Cancel")}
                    testID={cancelTestID}
                    style={{ alignSelf: "flex-end", minWidth: 44, minHeight: 44 }}
                  />
                  <View style={{ gap: 12, paddingBottom: 16 }}>
                    <View style={{ gap: 8, marginBottom: 8 }}>
                      <Dialog.Title>{title}</Dialog.Title>
                      <Dialog.Description>{description}</Dialog.Description>
                    </View>
                    {children ? <View style={{ gap: 12 }}>{children}</View> : null}
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
                    {actions.map((action, index) => (
                      <FormSubmitButton
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
                      </FormSubmitButton>
                    ))}
                  </View>
                </Dialog.Content>
              </InputFieldContext.Provider>
            </InputScrollContext.Provider>
          </FormInteractionScope>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
}
