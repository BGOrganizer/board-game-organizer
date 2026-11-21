import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useTableGuestVoteForm } from "@board-game-organizer/shared";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { CalendarDays, Dices, MapPin } from "lucide-react-native";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventVoteButtons } from "./EventVoteButtons";

export function EventGuestVoteEditor({
  table,
  registrationId,
  name,
  onClose,
}: {
  table: PlannedTableResponse;
  registrationId: string;
  name: string;
  onClose: () => void;
}) {
  const t = useT();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const form = useTableGuestVoteForm(useCommunityApi(), table, registrationId);
  const [selection, setSelection] = useState<string | null>(null);
  const tab = form.sections.find(({ kind }) => kind === selection)?.kind ?? form.sections[0]?.kind;
  const title = { date: t("Dates"), location: t("Locations"), game: t("Games") };
  const icons = { date: CalendarDays, location: MapPin, game: Dices };
  return (
    <FormInteractionScope>
      <BottomSheet
        isOpen
        onOpenChange={(open) => {
          if (!open && !form.saving) onClose();
        }}
      >
        <BottomSheet.Portal unstable_accessibilityContainerViewIsModal>
          <BottomSheet.Overlay isCloseOnPress={!form.saving} />
          <BottomSheet.Content
            snapPoints={["85%"]}
            enableOverDrag={false}
            enableDynamicSizing={false}
            enablePanDownToClose={!form.saving}
            contentContainerProps={{ style: { height: height * 0.8, padding: 20, gap: 12 } }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <BottomSheet.Title>{t("Edit guest votes")}</BottomSheet.Title>
              <BottomSheet.Close
                accessibilityLabel={t("Close")}
                isDisabled={form.saving}
                style={{ minWidth: 44, minHeight: 44 }}
              />
            </View>
            <BottomSheet.Description>{name}</BottomSheet.Description>
            {form.loading ? (
              <Skeleton style={{ height: 80, width: "100%", borderRadius: 12 }} />
            ) : null}
            {form.error ? (
              <View style={{ gap: 8 }}>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load guest votes")}
                </Typography>
                {!form.unavailable ? (
                  <Button variant="secondary" onPress={form.refresh}>
                    <Button.Label>{t("Try again")}</Button.Label>
                  </Button>
                ) : null}
              </View>
            ) : null}
            {form.failed && !form.error ? (
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Could not save guest vote. Try again.")}
              </Typography>
            ) : null}
            {tab ? (
              <Tabs value={tab} onValueChange={setSelection} style={{ flex: 1 }}>
                <TabBar>
                  {form.sections.map(({ kind }) => (
                    <TabTrigger key={kind} value={kind} icon={icons[kind]}>
                      <Tabs.Label>{title[kind]}</Tabs.Label>
                    </TabTrigger>
                  ))}
                </TabBar>
                {form.sections.map(({ kind, rows }) => (
                  <RetainedTabPanel key={kind} active={kind === tab}>
                    <InputFlatList
                      data={rows}
                      keyExtractor={(row) => row.key}
                      renderItem={({ item: row }) => {
                        const label = row.label || t("Unknown game");
                        const buttons = (
                          <EventVoteButtons
                            inline
                            label={label}
                            value={row.value}
                            disabledVotes={row.allowNo ? [] : ["NO"]}
                            busy={form.saving}
                            onChange={(vote) => form.choose(row, vote)}
                          />
                        );
                        const content =
                          row.kind === "location" ? (
                            <LocationListRow name={label} address={row.address} actions={buttons} />
                          ) : row.kind === "game" ? (
                            <GameListRow
                              name={label}
                              game={row.game}
                              imageUrl={row.game?.imageUrl}
                              actions={buttons}
                            />
                          ) : (
                            <GroupedRow>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <DateTimeInfo startsAt={row.startsAt} timeZone={row.timeZone} />
                              </View>
                              {buttons}
                            </GroupedRow>
                          );
                        return <GroupedList>{content}</GroupedList>;
                      }}
                    />
                  </RetainedTabPanel>
                ))}
              </Tabs>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Button
              onPress={() => form.submit(onClose)}
              isDisabled={!form.canSubmit}
              style={{ marginBottom: insets.bottom }}
            >
              <Button.Label>{t("Vote")}</Button.Label>
            </Button>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </FormInteractionScope>
  );
}
