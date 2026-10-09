import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
export function CommunityConfirm({
  title,
  description,
  busy,
  onConfirm,
  onCancel,
  actions,
}: {
  title: string;
  description: string;
  busy: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
  actions?: { label: string; variant: "danger" | "primary"; onPress: () => void }[];
}) {
  const t = useT();
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
            style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 12 }}
          >
            <Button variant="ghost" isDisabled={busy} onPress={onCancel}>
              {t("Cancel")}
            </Button>
            {(
              actions ??
              (onConfirm ? [{ label: title, variant: "danger" as const, onPress: onConfirm }] : [])
            ).map((action) => (
              <Button
                key={action.label}
                variant={action.variant}
                isDisabled={busy}
                onPress={action.onPress}
              >
                {action.label}
              </Button>
            ))}
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
