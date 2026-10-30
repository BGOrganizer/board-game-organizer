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
  registrationId,
}: {
  eventId: string;
  tableId: string;
  onClose: () => void;
  registrationId?: string;
}) {
  const { t } = useLingui(),
    form = useEventJoinForm(useCommunityApi(), eventId, tableId, onClose, registrationId),
    event = form.event,
    table = form.table;
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
            <Drawer.Heading>{t`Choose availability`}</Drawer.Heading>
            <p className="text-sm text-default-500">
              {form.isInvitation
                ? form.requiresAvailability
                  ? t`Vote on every date, location and game. Accept at least one of each to accept the invitation.`
                  : t`Vote on every game for this table. Accept at least one to accept the invitation.`
                : form.requiresAvailability
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
                    {!form.gamesOnly ? (
                      <>
                        <Tabs.Tab id="dates">
                          {t`Dates`}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="locations">
                          {t`Locations`}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      </>
                    ) : null}
                    <Tabs.Tab id="games">
                      {t`Games`}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>
                {!form.gamesOnly ? (
                  <>
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
                                busy={false}
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
                                  busy={false}
                                  onChange={(vote) => form.choose("location", row.id, vote)}
                                />
                              ) : undefined
                            }
                          />
                        ))}
                      </GroupedList>
                    </Tabs.Panel>
                  </>
                ) : null}
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
                                busy={false}
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
