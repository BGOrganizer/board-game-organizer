"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useTableGuestVoteForm } from "@board-game-organizer/shared";
import { Button, Drawer, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, MapPin } from "lucide-react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
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
  const { t } = useLingui();
  const form = useTableGuestVoteForm(useCommunityApi(), table, registrationId);
  const title = { date: t`Dates`, location: t`Locations`, game: t`Games` };
  const icons = { date: CalendarDays, location: MapPin, game: Dices };
  return (
    <Drawer.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open && !form.saving) onClose();
      }}
    >
      <Drawer.Content placement="bottom">
        <Drawer.Dialog
          data-form-scope
          className="mx-auto w-full max-w-2xl"
          style={{ maxHeight: "calc(var(--app-visible-height, 100dvh) * 0.85)" }}
        >
          <Drawer.CloseTrigger aria-label={t`Close`} isDisabled={form.saving} />
          <Drawer.Handle />
          <Drawer.Header>
            <Drawer.Heading>{t`Edit guest votes`}</Drawer.Heading>
            <p className="text-sm text-muted">{name}</p>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto">
            {form.loading ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
            {form.error ? (
              <div role="alert" className="space-y-2">
                <p className="text-danger">{t`Could not load guest votes`}</p>
                {!form.unavailable ? (
                  <Button variant="secondary" onPress={form.refresh}>{t`Try again`}</Button>
                ) : null}
              </div>
            ) : null}
            {form.failed && !form.error ? (
              <p
                role="alert"
                className="mb-3 text-danger"
              >{t`Could not save guest vote. Try again.`}</p>
            ) : null}
            {form.sections.length ? (
              <Tabs>
                <TabBar label={t`Availability`}>
                  {form.sections.map(({ kind }) => (
                    <TabTrigger id={kind} key={kind} icon={icons[kind]}>
                      {title[kind]}
                    </TabTrigger>
                  ))}
                </TabBar>
                {form.sections.map(({ kind, rows }) => (
                  <Tabs.Panel id={kind} key={kind}>
                    <GroupedList>
                      {rows.map((row) => {
                        const label = row.label || t`Unknown game`;
                        const buttons = (
                          <EventVoteButtons
                            key={row.key}
                            inline
                            label={label}
                            value={row.value}
                            disabledVotes={row.allowNo ? [] : ["NO"]}
                            busy={form.saving}
                            onChange={(vote) => form.save(row, vote)}
                          />
                        );
                        switch (row.kind) {
                          case "location":
                            return (
                              <LocationListRow
                                key={row.key}
                                name={label}
                                address={row.address}
                                actions={buttons}
                              />
                            );
                          case "game":
                            return (
                              <GameListRow
                                key={row.key}
                                name={label}
                                game={row.game}
                                imageUrl={row.game?.imageUrl}
                                actions={buttons}
                              />
                            );
                          default:
                            return (
                              <GroupedRow key={row.key} className="flex-wrap">
                                <DateTimeInfo startsAt={row.startsAt} timeZone={row.timeZone} />
                                {buttons}
                              </GroupedRow>
                            );
                        }
                      })}
                    </GroupedList>
                  </Tabs.Panel>
                ))}
              </Tabs>
            ) : null}
          </Drawer.Body>
          <Drawer.Footer>
            <Button onPress={onClose} isDisabled={form.saving}>{t`Done`}</Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
