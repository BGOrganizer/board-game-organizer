"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Info, Trophy, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";

export function EventTableDetailView({
  table,
  info,
  selectedKey,
  onSelectionChange,
  details,
  participants,
  results,
  detailsBadge,
  participantsBadge,
}: {
  table: Pick<PlannedTableResponse, "eventStatus" | "sharedResultsOnly">;
  info: ReactNode;
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  details: ReactNode;
  participants: ReactNode;
  results: ReactNode;
  detailsBadge?: ReactNode;
  participantsBadge?: ReactNode;
}) {
  const { t } = useLingui();

  return (
    <>
      {info}
      <Tabs selectedKey={selectedKey} onSelectionChange={(key) => onSelectionChange(String(key))}>
        <TabBar label={t`Table sections`}>
          <TabTrigger icon={Info} id="overview">
            {t`Details`}
            {detailsBadge}
          </TabTrigger>
          {!table.sharedResultsOnly ? (
            <TabTrigger icon={UsersRound} id="participants">
              {t`Participants`}
              {participantsBadge}
            </TabTrigger>
          ) : null}
          {table.eventStatus !== "PLANNING" ? (
            <TabTrigger icon={Trophy} id="results">{t`Results`}</TabTrigger>
          ) : null}
        </TabBar>

        <Tabs.Panel id={selectedKey}>
          {selectedKey === "results"
            ? results
            : selectedKey === "participants"
              ? participants
              : details}
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
