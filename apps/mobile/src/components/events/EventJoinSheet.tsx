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
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { TabBar } from "@/components/common/ui/TabBar";
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
  const t = useT(),
    form = useEventJoinForm(useCommunityApi(), eventId, tableId, onClose, registrationId),
    event = form.event,
    table = form.table,
    { height } = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    accent = useThemeColor("accent-foreground");
  const [selectedTab, setTab] = useState<string | null>(null),
    tab = selectedTab ?? form.initialTab ?? "dates";
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
          <BottomSheet.Title>{t("Choose availability")}</BottomSheet.Title>
          <BottomSheet.Description>
            {form.isInvitation
              ? form.requiresAvailability
                ? t(
                    "Vote on every date, location and game. Accept at least one of each to accept the invitation.",
                  )
                : t(
                    "Vote on every game for this table. Accept at least one to accept the invitation.",
                  )
              : form.requiresAvailability
                ? t("Vote on every date, location and game. Accept at least one of each to join.")
                : t(
                    "Vote on every game for this table. Accept at least one to join. Event preferences stay unchanged.",
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
          {!event || form.q.isPlaceholderData || !form.initialTab ? (
            <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
          ) : (
            <Tabs value={tab} onValueChange={setTab} style={{ flex: 1 }}>
              <TabBar style={{ alignSelf: "center", width: "auto" }}>
                {!form.gamesOnly ? (
                  <>
                    <Tabs.Trigger value="dates">
                      <Tabs.Label>{t("Dates")}</Tabs.Label>
                    </Tabs.Trigger>
                    <Tabs.Trigger value="locations">
                      <Tabs.Label>{t("Locations")}</Tabs.Label>
                    </Tabs.Trigger>
                  </>
                ) : null}
                <Tabs.Trigger value="games">
                  <Tabs.Label>{t("Games")}</Tabs.Label>
                </Tabs.Trigger>
              </TabBar>
              {tab === "dates" ? (
                <BottomSheetFlatList
                  key="dates"
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
                      {form.requiresAvailability ? (
                        <EventVoteButtons
                          inline
                          label={eventDateWall(event, item).replace("T", " ")}
                          value={form.votes.dateVotes[item.id]}
                          busy={false}
                          onChange={(vote) => form.choose("date", item.id, vote)}
                        />
                      ) : null}
                    </GroupedRow>
                  )}
                />
              ) : tab === "locations" ? (
                <BottomSheetFlatList
                  key="locations"
                  style={{ flex: 1 }}
                  data={event.locations}
                  keyExtractor={(row) => row.id}
                  renderItem={({ item }) => (
                    <LocationListRow
                      name={item.name}
                      address={item.address}
                      actions={
                        form.requiresAvailability ? (
                          <EventVoteButtons
                            inline
                            label={item.name}
                            value={form.votes.locationVotes[item.id]}
                            busy={false}
                            onChange={(vote) => form.choose("location", item.id, vote)}
                          />
                        ) : undefined
                      }
                    />
                  )}
                />
              ) : !table || form.tableQuery.isPlaceholderData ? (
                <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
              ) : (
                <BottomSheetFlatList
                  key="games"
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
              )}
            </Tabs>
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
            <Button variant="secondary" onPress={onClose} style={{ flex: 1 }}>
              <Button.Label>{t("Cancel")}</Button.Label>
            </Button>
            <Button
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
