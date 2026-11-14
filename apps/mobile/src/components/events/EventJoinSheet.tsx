import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventDateWall, eventLocalToIso, useEventJoinForm } from "@board-game-organizer/shared";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { CalendarDays, Dices, MapPin, UserRoundCheck } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { InputField } from "@/components/common/ui/InputField";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useValidationList } from "@/lib/useValidationList";
import { EventVoteButtons } from "./EventVoteButtons";

type Props = { eventId: string; tableId: string; onClose: () => void; registrationId?: string };
export function EventJoinSheet(props: Props) {
  const o = useCommunityApi();
  return (
    <FormInteractionScope
      key={JSON.stringify([o.apiUrl, o.userId, props.eventId, props.tableId, props.registrationId])}
    >
      <JoinContent {...props} />
    </FormInteractionScope>
  );
}
function JoinContent({ eventId, tableId, onClose, registrationId }: Props) {
  const t = useT();
  const o = useCommunityApi();
  const form = useEventJoinForm(o, eventId, tableId, onClose, registrationId);
  const { event, table, votingTabs } = form;
  const { height } = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    accent = useThemeColor("accent-foreground");
  const [selectedTab, setTab] = useState<string | null>(null);
  const tab =
    votingTabs.find((value) => value === selectedTab) ??
    votingTabs.find((value) => value === form.initialTab) ??
    votingTabs[0];
  const seenAttempt = useRef(0);
  useEffect(() => {
    if (!form.validationAttempt || seenAttempt.current === form.validationAttempt) return;
    seenAttempt.current = form.validationAttempt;
    if (form.invalidChoice) setTab(form.invalidChoice.tab);
  }, [form.validationAttempt, form.invalidChoice]);
  const validationScope = JSON.stringify([
    o.apiUrl,
    o.userId,
    eventId,
    tableId,
    event?.version,
    tab,
  ]);
  const validation = useValidationList({
    scope: validationScope,
    attempt: form.validationAttempt,
    index: form.invalidChoice?.index,
    active: form.invalidChoice?.tab === tab,
  });
  const invalidRow = (index: number) =>
    form.validationAttempt > 0 &&
    form.invalidChoice?.tab === tab &&
    form.invalidChoice.index === index;
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
                      <TabTrigger icon={CalendarDays} value="dates">
                        <Tabs.Label>{t("Dates")}</Tabs.Label>
                      </TabTrigger>
                    ) : null}
                    {votingTabs.includes("locations") ? (
                      <TabTrigger icon={MapPin} value="locations">
                        <Tabs.Label>{t("Locations")}</Tabs.Label>
                      </TabTrigger>
                    ) : null}
                    {votingTabs.includes("games") ? (
                      <TabTrigger icon={Dices} value="games">
                        <Tabs.Label>{t("Games")}</Tabs.Label>
                      </TabTrigger>
                    ) : null}
                  </TabBar>
                  {tab === "dates" ? (
                    <InputFlatList
                      key={validationScope}
                      {...validation}
                      ListHeaderComponent={fixedSettings}
                      style={{ flex: 1 }}
                      data={event.dates}
                      keyExtractor={(row) => row.id}
                      renderItem={({ item, index }) => (
                        <InputField
                          invalid={invalidRow(index)}
                          className={
                            invalidRow(index) ? "rounded-lg border border-danger" : undefined
                          }
                        >
                          <GroupedRow>
                            <View style={{ flex: 1 }}>
                              <DateTimeInfo
                                startsAt={eventLocalToIso(
                                  eventDateWall(event, item),
                                  event.timeZone,
                                )}
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
                        </InputField>
                      )}
                    />
                  ) : tab === "locations" ? (
                    <InputFlatList
                      key={validationScope}
                      {...validation}
                      ListHeaderComponent={fixedSettings}
                      style={{ flex: 1 }}
                      data={event.locations}
                      keyExtractor={(row) => row.id}
                      renderItem={({ item, index }) => (
                        <InputField
                          invalid={invalidRow(index)}
                          className={
                            invalidRow(index) ? "rounded-lg border border-danger" : undefined
                          }
                        >
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
                        </InputField>
                      )}
                    />
                  ) : table ? (
                    <InputFlatList
                      key={validationScope}
                      {...validation}
                      ListHeaderComponent={fixedSettings}
                      style={{ flex: 1 }}
                      data={table.games}
                      keyExtractor={(row) => String(row.gameId)}
                      renderItem={({ item, index }) => {
                        const game = table.gamesDetail.find((row) => row.id === item.gameId);
                        return (
                          <InputField
                            invalid={invalidRow(index)}
                            className={
                              invalidRow(index) ? "rounded-lg border border-danger" : undefined
                            }
                          >
                            <GameListRow
                              year={game?.year}
                              average={game?.average}
                              rank={game?.rank}
                              durationMinutes={item.durationMinutes}
                              name={game?.name ?? t("Unknown")}
                              imageUrl={game?.imageUrl}
                              actions={
                                <EventVoteButtons
                                  inline
                                  label={game?.name ?? t("Unknown")}
                                  value={form.votes.gameVotes[String(item.gameId)]}
                                  busy={false}
                                  onChange={(vote) =>
                                    form.choose("game", String(item.gameId), vote)
                                  }
                                />
                              }
                            />
                          </InputField>
                        );
                      }}
                    />
                  ) : null}
                </Tabs>
              ) : (
                <InputFlatList
                  style={{ flex: 1 }}
                  data={[]}
                  renderItem={() => null}
                  ListHeaderComponent={fixedSettings}
                />
              )}
            </View>
          )}
          {form.validationAttempt > 0 && form.invalidChoice ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Answer every option and choose at least one Yes or If needed in each section.")}
            </Typography>
          ) : null}
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
              isDisabled={!form.canAttempt}
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
        <GameListRow
          name={game?.name ?? t("Unknown")}
          imageUrl={game?.imageUrl}
          year={game?.year}
          average={game?.average}
          rank={game?.rank}
          durationMinutes={table?.games[0]?.durationMinutes}
        />
      ) : null}
    </GroupedList>
  );
}
