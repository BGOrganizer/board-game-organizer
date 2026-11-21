import type { OptionVoteVoters as Voters } from "@board-game-organizer/schemas";
import { formatUsername } from "@board-game-organizer/shared";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { useThemeColor } from "heroui-native/hooks";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { Check, Minus, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { useT } from "@/lib/i18n";

export function VoteResultSheet({
  voters,
  label,
  initialVote = "YES",
  onClose,
}: {
  voters: Voters;
  label: string;
  initialVote?: keyof Voters;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<string>(initialVote);
  const [success, warning, danger] = useThemeColor(["success", "warning", "danger"]);
  const choices = [
    { id: "YES", text: t("Yes"), Icon: Check, color: success },
    { id: "IF_NEEDED", text: t("If needed"), Icon: Minus, color: warning },
    { id: "NO", text: t("No"), Icon: X, color: danger },
  ] as const;
  return (
    <BottomSheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheet.Portal unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={["80%"]}
          enableDynamicSizing={false}
          enablePanDownToClose
          contentContainerProps={{ style: { flex: 1 } }}
        >
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 4 }}>
            <BottomSheet.Close
              accessibilityLabel={t("Close")}
              style={{ alignSelf: "flex-end", minWidth: 44, minHeight: 44 }}
            />
            <BottomSheet.Title>{t("Votes")}</BottomSheet.Title>
            <BottomSheet.Description>{label}</BottomSheet.Description>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom }}>
            <Tabs value={selection} onValueChange={setSelection} style={{ flex: 1 }}>
              <TabBar>
                {choices.map(({ id, text, Icon, color }) => (
                  <TabTrigger key={id} value={id} icon={Icon} iconColor={color}>
                    <Tabs.Label>{text}</Tabs.Label>
                  </TabTrigger>
                ))}
              </TabBar>
              {choices.map(({ id }) => (
                <RetainedTabPanel key={id} active={id === selection}>
                  <InputFlatList
                    data={voters[id]}
                    keyExtractor={(person) => person.userId}
                    ListEmptyComponent={
                      <Typography className="p-3 text-sm text-muted">{t("No votes")}</Typography>
                    }
                    renderItem={({ item: person }) => {
                      const username = formatUsername(
                        person.guestName ?? person.username,
                        t("Username unavailable"),
                      );
                      return (
                        <GroupedList>
                          <GroupedRow>
                            <UserAvatar
                              name={username}
                              avatarUrl={person.avatarUrl}
                              avatarContent={
                                person.guestName ? (
                                  <GuestAvatar name={person.guestName} />
                                ) : undefined
                              }
                            />
                            <Typography className="text-sm font-medium" style={{ flex: 1 }}>
                              {username}
                            </Typography>
                          </GroupedRow>
                        </GroupedList>
                      );
                    }}
                  />
                </RetainedTabPanel>
              ))}
            </Tabs>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
