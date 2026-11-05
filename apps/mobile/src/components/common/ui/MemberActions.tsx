import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { UserRoundCog } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";

export function MemberActions<Action extends string>({
  title,
  busy,
  items,
  onAction,
  onOpenChange,
}: {
  title: string;
  busy: boolean;
  items: readonly { action: Action; label: string; icon: ReactNode }[];
  onAction: (action: Action) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT(),
    insets = useSafeAreaInsets(),
    accent = useThemeColor("accent-foreground");
  const [open, setOpen] = useState(false);
  const change = (value: boolean) => {
    setOpen(value);
    onOpenChange?.(value);
  };
  if (!items.length) return null;
  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="primary"
        style={{ minWidth: 44, minHeight: 44 }}
        isDisabled={busy}
        accessibilityLabel={title}
        onPress={() => change(true)}
      >
        <UserRoundCog size={20} color={accent} accessible={false} />
      </Button>
      <BottomSheet isOpen={open} onOpenChange={change}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <View style={{ gap: 12, paddingBottom: Math.max(insets.bottom, 16) }}>
              <BottomSheet.Title>{title}</BottomSheet.Title>
              {items.map(({ action, label, icon }) => (
                <Button
                  key={action}
                  variant="ghost"
                  style={{ minHeight: 44, justifyContent: "flex-start" }}
                  isDisabled={busy}
                  onPress={() => {
                    change(false);
                    onAction(action);
                  }}
                >
                  {icon}
                  <Button.Label>{label}</Button.Label>
                </Button>
              ))}
              <Button variant="ghost" onPress={() => change(false)}>
                <Button.Label>{t("Cancel")}</Button.Label>
              </Button>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
