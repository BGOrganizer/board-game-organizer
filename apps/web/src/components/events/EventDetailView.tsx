"use client";

import type { ClientEventRecord } from "@board-game-organizer/shared";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Dices, Info, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { EventDetailsCard } from "./EventDetailsCard";
import { EventSectionHeader } from "./EventSectionHeader";

export function EventDetailView({
  event,
  selectedKey,
  onSelectionChange,
  titleAction,
  detailsBadge,
  participantsBadge,
  tablesBadge,
  details,
  participants,
  tables,
}: {
  event: ClientEventRecord;
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  titleAction?: ReactNode;
  detailsBadge?: ReactNode;
  participantsBadge?: ReactNode;
  tablesBadge?: ReactNode;
  details: ReactNode;
  participants: ReactNode;
  tables: ReactNode;
}) {
  const { t } = useLingui();
  const showParticipants = !event.sharedResultsOnly && !event.personalAccessOnly;
  const tab =
    selectedKey === "tables" || (showParticipants && selectedKey === "participants")
      ? selectedKey
      : "details";
  return (
    <>
      <EventDetailsCard event={event} titleAction={titleAction} />
      <Tabs
        selectedKey={tab}
        onSelectionChange={(value) => onSelectionChange(String(value))}
        className="flex flex-col"
      >
        <TabBar label={t`Event details`}>
          <TabTrigger icon={Info} id="details">
            {t`Details`}
            {detailsBadge}
          </TabTrigger>
          {showParticipants ? (
            <TabTrigger icon={UsersRound} id="participants">
              {t`Participants`}
              {participantsBadge}
            </TabTrigger>
          ) : null}
          <TabTrigger icon={Dices} id="tables">
            {t`Tables`}
            {tablesBadge}
          </TabTrigger>
        </TabBar>
        <Tabs.Panel id="details" className="space-y-4 pt-4">
          {details}
        </Tabs.Panel>
        {showParticipants ? (
          <Tabs.Panel id="participants" className="space-y-4 pt-4">
            <EventSectionHeader event={event} section="participants" />
            {participants}
          </Tabs.Panel>
        ) : null}
        <Tabs.Panel id="tables" className="pt-4">
          <section className="space-y-3" aria-label={t`Table list`}>
            <EventSectionHeader event={event} section="tables" />
            {tables}
          </section>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
