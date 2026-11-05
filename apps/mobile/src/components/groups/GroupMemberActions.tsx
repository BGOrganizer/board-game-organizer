import type { GroupPersonResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import { type GroupPersonAction, groupPersonActions } from "@board-game-organizer/shared";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Ban, ShieldMinus, ShieldPlus, UserRoundCog, UserRoundMinus } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";

export function GroupMemberActions({
  group,
  person,
  busy,
  onAction,
  onOpenChange,
}: {
  group: GroupRecordResponse;
  person: GroupPersonResponse;
  busy: boolean;
  onAction: (action: GroupPersonAction) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT(),
    insets = useSafeAreaInsets();
  const [foreground, accent] = useThemeColor(["foreground", "accent-foreground"]);
  const [open, setOpen] = useState(false);
  const allowed = groupPersonActions(group, person);
  const items = [
    { action: "ban", label: t("Ban from group"), Icon: Ban },
    { action: "remove", label: t("Remove member"), Icon: UserRoundMinus },
    { action: "promote", label: t("Make moderator"), Icon: ShieldPlus },
    { action: "demote", label: t("Demote to member"), Icon: ShieldMinus },
  ] as const;
  const change = (value: boolean) => {
    setOpen(value);
    onOpenChange(value);
  };
  if (!items.some((item) => allowed.includes(item.action))) return null;
  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="primary"
        style={{ minWidth: 44, minHeight: 44 }}
        isDisabled={busy}
        accessibilityLabel={`${t("Manage member")}: ${person.username || person.name || t("Username unavailable")}`}
        onPress={() => change(true)}
      >
        <UserRoundCog size={20} color={accent} accessible={false} />
      </Button>
      <BottomSheet isOpen={open} onOpenChange={change}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <View style={{ gap: 12, paddingBottom: Math.max(insets.bottom, 16) }}>
              <BottomSheet.Title>
                {t("Manage member")}: {person.username || person.name || t("Username unavailable")}
              </BottomSheet.Title>
              {items
                .filter((item) => allowed.includes(item.action))
                .map(({ action, label, Icon }) => (
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
                    <Icon size={20} color={foreground} accessible={false} />
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
