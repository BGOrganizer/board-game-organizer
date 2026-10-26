"use client";
import { eventDateWall, eventLocalToIso, useEventJoinForm } from "@board-game-organizer/shared";
import { Button, Drawer, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UserRoundCheck } from "lucide-react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
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
    event = form.event;
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
            <p className="text-sm text-default-500">{t`Vote on every date and location. Accept at least one of each to join. You can change these votes from the event.`}</p>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto">
            {form.q.isError ? (
              <div role="alert">
                <p className="text-danger">{t`Unable to load data. Try again.`}</p>
                <Button onPress={() => void form.q.refetch()}>{t`Try again`}</Button>
              </div>
            ) : null}
            {!event || form.q.isPlaceholderData ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <Tabs defaultSelectedKey="dates">
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
                        <EventVoteButtons
                          inline
                          allowUnknown={false}
                          label={eventDateWall(event, row).replace("T", " ")}
                          value={form.votes.dateVotes[row.id]}
                          busy={form.busy}
                          onChange={(vote) => form.choose("date", row.id, vote)}
                        />
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
                          <EventVoteButtons
                            inline
                            allowUnknown={false}
                            label={row.name}
                            value={form.votes.locationVotes[row.id]}
                            busy={form.busy}
                            onChange={(vote) => form.choose("location", row.id, vote)}
                          />
                        }
                      />
                    ))}
                  </GroupedList>
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
