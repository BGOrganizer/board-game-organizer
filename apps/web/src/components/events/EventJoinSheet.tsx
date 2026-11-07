"use client";
import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventDateWall, eventLocalToIso, useEventJoinForm } from "@board-game-organizer/shared";
import { Button, Drawer, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, MapPin, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
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
  const { t } = useLingui();
  const form = useEventJoinForm(useCommunityApi(), eventId, tableId, onClose, registrationId);
  const { event, table, votingTabs } = form;
  const [selection, setSelection] = useState<string | null>(null);
  const tab =
    votingTabs.find((value) => value === selection) ??
    votingTabs.find((value) => value === form.initialTab) ??
    votingTabs[0];
  return (
    <Drawer.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Content placement="bottom">
        <Drawer.Dialog className="mx-auto max-h-[85dvh] w-full max-w-2xl">
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
                          {event.dates.map((row) => (
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
                          {event.locations.map((row) => (
                            <LocationListRow
                              key={row.id}
                              name={row.name}
                              address={row.address}
                              actions={
                                <EventVoteButtons
                                  inline
                                  label={row.name}
                                  value={form.votes.locationVotes[row.id]}
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
                          {table.games.map(({ gameId }) => {
                            const game = table.gamesDetail.find((row) => row.id === gameId);
                            return (
                              <GameListRow
                                key={gameId}
                                name={game?.name ?? t`Unknown`}
                                imageUrl={game?.imageUrl}
                                actions={
                                  <EventVoteButtons
                                    inline
                                    label={game?.name ?? t`Unknown`}
                                    value={form.votes.gameVotes[String(gameId)]}
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
            <Button isDisabled={!form.canSubmit} onPress={() => void form.submit()}>
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
        <GameListRow name={game?.name ?? t`Unknown`} imageUrl={game?.imageUrl} />
      ) : null}
    </GroupedList>
  );
}
