import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventDateWall, eventLocalToIso, useEventJoinForm } from "@board-game-organizer/shared";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { UserRoundCheck } from "lucide-react-native";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventVoteButtons } from "./EventVoteButtons";

export function EventJoinSheet({
  eventId,
  tableId,
  onClose,
  registrationId,
}: {
  eventId: string;
  tableId: string;
  onClose: () => void;
  registrationId?: string;
}) {
  const t = useT();
  const form = useEventJoinForm(useCommunityApi(), eventId, tableId, onClose, registrationId);
  const { event, table, votingTabs } = form;
  const { height } = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    accent = useThemeColor("accent-foreground");
  const [selectedTab, setTab] = useState<string | null>(null);
  const tab =
    votingTabs.find((value) => value === selectedTab) ??
    votingTabs.find((value) => value === form.initialTab) ??
    votingTabs[0];
  const fixedSettings = event ? (
    <View style={{ gap: 12 }}>
      <FixedSettings event={event} table={form.tableQuery.isPlaceholderData ? undefined : table} />
      {!table || form.tableQuery.isPlaceholderData ? (
        <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
      ) : null}
    </View>
  ) : null;
  return (
    <BottomSheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={["85%"]}
          enableOverDrag={false}
          enableDynamicSizing={false}
          enablePanDownToClose
          contentContainerProps={{ style: { height: height * 0.8, padding: 20, gap: 12 } }}
        >
          <BottomSheet.Title>{t("Review table settings")}</BottomSheet.Title>
          <BottomSheet.Description>
            {form.isInvitation
              ? t(
                  "Accepting this invitation accepts the current event and table settings. Vote only where multiple options are available.",
                )
              : t(
                  "Joining accepts the current event and table settings. Vote only where multiple options are available.",
                )}
          </BottomSheet.Description>
          {form.q.isError || form.tableQuery.isError ? (
            <View style={{ gap: 8 }}>
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Unable to load data. Try again.")}
              </Typography>
              <Button onPress={form.refetch}>
                <Button.Label>{t("Try again")}</Button.Label>
              </Button>
            </View>
          ) : null}
          {!form.ready || !event ? (
            <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
          ) : (
            <View style={{ flex: 1, gap: 12 }}>
              {tab && votingTabs.length ? (
                <Tabs value={tab} onValueChange={setTab} style={{ flex: 1 }}>
                  <TabBar>
                    {votingTabs.includes("dates") ? (
                      <TabTrigger value="dates">
                        <Tabs.Label>{t("Dates")}</Tabs.Label>
                      </TabTrigger>
                    ) : null}
                    {votingTabs.includes("locations") ? (
                      <TabTrigger value="locations">
                        <Tabs.Label>{t("Locations")}</Tabs.Label>
                      </TabTrigger>
                    ) : null}
                    {votingTabs.includes("games") ? (
                      <TabTrigger value="games">
                        <Tabs.Label>{t("Games")}</Tabs.Label>
                      </TabTrigger>
                    ) : null}
                  </TabBar>
                  {tab === "dates" ? (
                    <BottomSheetFlatList
                      key="dates"
                      ListHeaderComponent={fixedSettings}
                      style={{ flex: 1 }}
                      data={event.dates}
                      keyExtractor={(row) => row.id}
                      renderItem={({ item }) => (
                        <GroupedRow>
                          <View style={{ flex: 1 }}>
                            <DateTimeInfo
                              startsAt={eventLocalToIso(eventDateWall(event, item), event.timeZone)}
                              timeZone={event.timeZone}
                            />
                          </View>
                          <EventVoteButtons
                            inline
                            label={eventDateWall(event, item).replace("T", " ")}
                            value={form.votes.dateVotes[item.id]}
                            busy={false}
                            onChange={(vote) => form.choose("date", item.id, vote)}
                          />
                        </GroupedRow>
                      )}
                    />
                  ) : tab === "locations" ? (
                    <BottomSheetFlatList
                      key="locations"
                      ListHeaderComponent={fixedSettings}
                      style={{ flex: 1 }}
                      data={event.locations}
                      keyExtractor={(row) => row.id}
                      renderItem={({ item }) => (
                        <LocationListRow
                          name={item.name}
                          address={item.address}
                          actions={
                            <EventVoteButtons
                              inline
                              label={item.name}
                              value={form.votes.locationVotes[item.id]}
                              busy={false}
                              onChange={(vote) => form.choose("location", item.id, vote)}
                            />
                          }
                        />
                      )}
                    />
                  ) : table ? (
                    <BottomSheetFlatList
                      key="games"
                      ListHeaderComponent={fixedSettings}
                      style={{ flex: 1 }}
                      data={table.games}
                      keyExtractor={(row) => String(row.gameId)}
                      renderItem={({ item }) => {
                        const game = table.gamesDetail.find((row) => row.id === item.gameId);
                        return (
                          <GameListRow
                            name={game?.name ?? t("Unknown")}
                            imageUrl={game?.imageUrl}
                            actions={
                              <EventVoteButtons
                                inline
                                label={game?.name ?? t("Unknown")}
                                value={form.votes.gameVotes[String(item.gameId)]}
                                busy={false}
                                onChange={(vote) => form.choose("game", String(item.gameId), vote)}
                              />
                            }
                          />
                        );
                      }}
                    />
                  ) : null}
                </Tabs>
              ) : (
                <BottomSheetFlatList
                  style={{ flex: 1 }}
                  data={[]}
                  renderItem={() => null}
                  ListHeaderComponent={fixedSettings}
                />
              )}
            </View>
          )}
          {form.invitationUnavailable ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Invitation unavailable")}
            </Typography>
          ) : null}
          {form.checking ? (
            <View style={{ gap: 8 }}>
              <Typography accessibilityLiveRegion="polite" className="text-foreground">
                {t("Checking saved changes")}
              </Typography>
              <Button onPress={form.refetch}>
                <Button.Label>{t("Check saved changes")}</Button.Label>
              </Button>
            </View>
          ) : null}
          {form.failed ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {form.isInvitation ? t("Could not accept invitation") : t("Could not join table")}
            </Typography>
          ) : null}
          <View style={{ flexDirection: "row", gap: 12, paddingBottom: insets.bottom }}>
            <Button
              testID="table-consent-cancel"
              variant="secondary"
              onPress={onClose}
              style={{ flex: 1 }}
            >
              <Button.Label>{t("Cancel")}</Button.Label>
            </Button>
            <Button
              testID="table-consent-submit"
              isDisabled={!form.canSubmit}
              onPress={() => void form.submit()}
              style={{ flex: 1 }}
            >
              <UserRoundCheck size={16} color={accent} accessible={false} />
              <Button.Label>
                {form.isInvitation ? t("Accept invitation") : t("Join table")}
              </Button.Label>
            </Button>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function FixedSettings({
  event,
  table,
}: {
  event: PlannedEventResponse;
  table: PlannedTableResponse | undefined;
}) {
  const t = useT();
  const date = event.dates.length === 1 ? event.dates[0] : undefined;
  const location = event.locations.length === 1 ? event.locations[0] : undefined;
  const gameId = table?.games.length === 1 ? table.games[0].gameId : undefined;
  const game = table?.gamesDetail.find((row) => row.id === gameId);
  if (!date && !location && gameId === undefined) return null;
  return (
    <GroupedList>
      {date ? (
        <GroupedRow>
          <DateTimeInfo
            startsAt={eventLocalToIso(eventDateWall(event, date), event.timeZone)}
            timeZone={event.timeZone}
          />
        </GroupedRow>
      ) : null}
      {location ? <LocationListRow name={location.name} address={location.address} /> : null}
      {gameId !== undefined ? (
        <GameListRow name={game?.name ?? t("Unknown")} imageUrl={game?.imageUrl} />
      ) : null}
    </GroupedList>
  );
}
