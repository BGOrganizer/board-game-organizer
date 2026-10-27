"use client";
import { eventDateWall, eventLocalToIso, useEventJoinForm } from "@board-game-organizer/shared";
import { Button, Drawer, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UserRoundCheck } from "lucide-react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventVoteButtons } from "./EventVoteButtons";
export function EventJoinSheet({
  eventId,
  tableId,
  onClose,
}: {
  eventId: string;
  tableId: string;
  onClose: () => void;
}) {
  const { t } = useLingui(),
    form = useEventJoinForm(useCommunityApi(), eventId, tableId, onClose),
    event = form.event,
    table = form.table;
  return (
    <Drawer.Backdrop
      isOpen
      isDismissable={!form.busy}
      onOpenChange={(open) => {
        if (!open && !form.busy) onClose();
      }}
    >
      <Drawer.Content placement="bottom">
        <Drawer.Dialog className="mx-auto max-h-[85dvh] w-full max-w-2xl">
          <Drawer.CloseTrigger aria-label={t`Cancel`} isDisabled={form.busy} />
          <Drawer.Handle />
          <Drawer.Header>
            <Drawer.Heading>{t`Choose availability`}</Drawer.Heading>
            <p className="text-sm text-default-500">
              {form.requiresAvailability
                ? t`Vote on every date, location and game. Accept at least one of each to join.`
                : t`Vote on every game for this table. Accept at least one to join. Event preferences stay unchanged.`}
            </p>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto">
            {form.q.isError || form.tableQuery.isError ? (
              <div role="alert">
                <p className="text-danger">{t`Unable to load data. Try again.`}</p>
                <Button onPress={form.refetch}>{t`Try again`}</Button>
              </div>
            ) : null}
            {!event || form.q.isPlaceholderData || !form.initialTab ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <Tabs defaultSelectedKey={form.initialTab}>
                <Tabs.ListContainer className="mx-auto mb-3 w-fit">
                  <Tabs.List aria-label={t`Availability`}>
                    <Tabs.Tab id="dates">
                      {t`Dates`}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab id="locations">
                      {t`Locations`}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab id="games">
                      {t`Games`}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>
                <Tabs.Panel id="dates">
                  <GroupedList>
                    {event.dates.map((row) => (
                      <GroupedRow key={row.id} className="flex-wrap">
                        <DateTimeInfo
                          startsAt={eventLocalToIso(eventDateWall(event, row), event.timeZone)}
                          timeZone={event.timeZone}
                        />
                        {form.requiresAvailability ? (
                          <EventVoteButtons
                            inline
                            label={eventDateWall(event, row).replace("T", " ")}
                            value={form.votes.dateVotes[row.id]}
                            busy={form.busy}
                            onChange={(vote) => form.choose("date", row.id, vote)}
                          />
                        ) : null}
                      </GroupedRow>
                    ))}
                  </GroupedList>
                </Tabs.Panel>
                <Tabs.Panel id="locations">
                  <GroupedList>
                    {event.locations.map((row) => (
                      <LocationListRow
                        key={row.id}
                        name={row.name}
                        address={row.address}
                        actions={
                          form.requiresAvailability ? (
                            <EventVoteButtons
                              inline
                              label={row.name}
                              value={form.votes.locationVotes[row.id]}
                              busy={form.busy}
                              onChange={(vote) => form.choose("location", row.id, vote)}
                            />
                          ) : undefined
                        }
                      />
                    ))}
                  </GroupedList>
                </Tabs.Panel>
                <Tabs.Panel id="games">
                  {!table || form.tableQuery.isPlaceholderData ? (
                    <Skeleton className="h-40 w-full rounded-xl" />
                  ) : (
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
                                busy={form.busy}
                                onChange={(vote) => form.choose("game", String(gameId), vote)}
                              />
                            }
                          />
                        );
                      })}
                    </GroupedList>
                  )}
                </Tabs.Panel>
              </Tabs>
            )}
            {form.failed ? (
              <p role="alert" className="text-danger">{t`Could not join table`}</p>
            ) : null}
          </Drawer.Body>
          <Drawer.Footer>
            <Button
              variant="secondary"
              isDisabled={form.busy}
              onPress={onClose}
            >{t`Cancel`}</Button>
            <Button isDisabled={!form.canSubmit} onPress={() => void form.submit()}>
              <UserRoundCheck className="size-4" aria-hidden />
              {t`Join table`}
            </Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
