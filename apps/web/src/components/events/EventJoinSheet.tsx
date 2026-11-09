"use client";
import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventDateWall, eventLocalToIso, useEventJoinForm } from "@board-game-organizer/shared";
import { Button, Drawer, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, MapPin, UserRoundCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventVoteButtons } from "./EventVoteButtons";

type Props = { eventId: string; tableId: string; onClose: () => void; registrationId?: string };
export function EventJoinSheet(props: Props) {
  const o = useCommunityApi();
  return (
    <JoinContent
      key={JSON.stringify([o.apiUrl, o.userId, props.eventId, props.tableId, props.registrationId])}
      {...props}
    />
  );
}
function JoinContent({ eventId, tableId, onClose, registrationId }: Props) {
  const { t } = useLingui();
  const form = useEventJoinForm(useCommunityApi(), eventId, tableId, onClose, registrationId);
  const { event, table, votingTabs } = form;
  const [selection, setSelection] = useState<string | null>(null);
  const tab =
    votingTabs.find((value) => value === selection) ??
    votingTabs.find((value) => value === form.initialTab) ??
    votingTabs[0];
  const seenAttempt = useRef(0);
  useEffect(() => {
    if (!form.validationAttempt || seenAttempt.current === form.validationAttempt) return;
    seenAttempt.current = form.validationAttempt;
    if (form.invalidChoice) setSelection(form.invalidChoice.tab);
  }, [form.validationAttempt, form.invalidChoice]);
  const invalidRow = (kind: string, index: number) =>
    form.validationAttempt > 0 &&
    form.invalidChoice?.tab === kind &&
    tab === kind &&
    form.invalidChoice.index === index;
  return (
    <Drawer.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Content placement="bottom">
        <Drawer.Dialog
          data-form-scope
          data-form-source={event?.version}
          className="mx-auto w-full max-w-2xl"
          style={{ maxHeight: "calc(var(--app-visible-height, 100dvh) * 0.85)" }}
        >
          <Drawer.CloseTrigger aria-label={t`Cancel`} />
          <Drawer.Handle />
          <Drawer.Header>
            <Drawer.Heading>{t`Review table settings`}</Drawer.Heading>
            <p className="text-sm text-muted">
              {form.isInvitation
                ? t`Accepting this invitation accepts the current event and table settings. Vote only where multiple options are available.`
                : t`Joining accepts the current event and table settings. Vote only where multiple options are available.`}
            </p>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto">
            {form.q.isError || form.tableQuery.isError ? (
              <div role="alert">
                <p className="text-danger">{t`Unable to load data. Try again.`}</p>
                <Button onPress={form.refetch}>{t`Try again`}</Button>
              </div>
            ) : null}
            {!form.ready || !event ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <>
                <FixedSettings
                  event={event}
                  table={form.tableQuery.isPlaceholderData ? undefined : table}
                />
                {!table || form.tableQuery.isPlaceholderData ? (
                  <Skeleton className="h-24 w-full rounded-xl" />
                ) : null}
                {tab && votingTabs.length ? (
                  <Tabs selectedKey={tab} onSelectionChange={(key) => setSelection(String(key))}>
                    <TabBar label={t`Availability`}>
                      {votingTabs.includes("dates") ? (
                        <TabTrigger icon={CalendarDays} id="dates">
                          {t`Dates`}
                          <Tabs.Indicator />
                        </TabTrigger>
                      ) : null}
                      {votingTabs.includes("locations") ? (
                        <TabTrigger icon={MapPin} id="locations">
                          {t`Locations`}
                          <Tabs.Indicator />
                        </TabTrigger>
                      ) : null}
                      {votingTabs.includes("games") ? (
                        <TabTrigger icon={Dices} id="games">
                          {t`Games`}
                          <Tabs.Indicator />
                        </TabTrigger>
                      ) : null}
                    </TabBar>
                    {votingTabs.includes("dates") ? (
                      <Tabs.Panel id="dates">
                        <GroupedList>
                          {event.dates.map((row, index) => (
                            <GroupedRow key={row.id} className="flex-wrap">
                              <DateTimeInfo
                                startsAt={eventLocalToIso(
                                  eventDateWall(event, row),
                                  event.timeZone,
                                )}
                                timeZone={event.timeZone}
                              />
                              <EventVoteButtons
                                inline
                                label={eventDateWall(event, row).replace("T", " ")}
                                value={form.votes.dateVotes[row.id]}
                                isInvalid={invalidRow("dates", index)}
                                busy={false}
                                onChange={(vote) => form.choose("date", row.id, vote)}
                              />
                            </GroupedRow>
                          ))}
                        </GroupedList>
                      </Tabs.Panel>
                    ) : null}
                    {votingTabs.includes("locations") ? (
                      <Tabs.Panel id="locations">
                        <GroupedList>
                          {event.locations.map((row, index) => (
                            <LocationListRow
                              key={row.id}
                              name={row.name}
                              address={row.address}
                              actions={
                                <EventVoteButtons
                                  inline
                                  label={row.name}
                                  value={form.votes.locationVotes[row.id]}
                                  isInvalid={invalidRow("locations", index)}
                                  busy={false}
                                  onChange={(vote) => form.choose("location", row.id, vote)}
                                />
                              }
                            />
                          ))}
                        </GroupedList>
                      </Tabs.Panel>
                    ) : null}
                    {table && votingTabs.includes("games") ? (
                      <Tabs.Panel id="games">
                        <GroupedList>
                          {table.games.map(({ gameId, durationMinutes }, index) => {
                            const game = table.gamesDetail.find((row) => row.id === gameId);
                            return (
                              <GameListRow
                                key={gameId}
                                year={game?.year}
                                average={game?.average}
                                rank={game?.rank}
                                durationMinutes={durationMinutes}
                                name={game?.name ?? t`Unknown`}
                                imageUrl={game?.imageUrl}
                                actions={
                                  <EventVoteButtons
                                    inline
                                    label={game?.name ?? t`Unknown`}
                                    value={form.votes.gameVotes[String(gameId)]}
                                    isInvalid={invalidRow("games", index)}
                                    busy={false}
                                    onChange={(vote) => form.choose("game", String(gameId), vote)}
                                  />
                                }
                              />
                            );
                          })}
                        </GroupedList>
                      </Tabs.Panel>
                    ) : null}
                  </Tabs>
                ) : null}
              </>
            )}
            {form.validationAttempt > 0 && form.invalidChoice ? (
              <p
                role="alert"
                className="text-danger"
              >{t`Answer every option and choose at least one Yes or If needed in each section.`}</p>
            ) : null}
            {form.invitationUnavailable ? (
              <p role="alert" className="text-danger">{t`Invitation unavailable`}</p>
            ) : null}
            {form.checking ? (
              <div role="status">
                <p>{t`Checking saved changes`}</p>
                <Button onPress={form.refetch}>{t`Check saved changes`}</Button>
              </div>
            ) : null}
            {form.failed ? (
              <p role="alert" className="text-danger">
                {form.isInvitation ? t`Could not accept invitation` : t`Could not join table`}
              </p>
            ) : null}
          </Drawer.Body>
          <Drawer.Footer>
            <Button variant="secondary" onPress={onClose}>{t`Cancel`}</Button>
            <Button
              data-form-submit
              isDisabled={!form.canAttempt}
              onPress={() => void form.submit()}
            >
              <UserRoundCheck className="size-4" aria-hidden />
              {form.isInvitation ? t`Accept invitation` : t`Join table`}
            </Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function FixedSettings({
  event,
  table,
}: {
  event: PlannedEventResponse;
  table: PlannedTableResponse | undefined;
}) {
  const { t } = useLingui();
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
          name={game?.name ?? t`Unknown`}
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
