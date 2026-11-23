"use client";

import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, ChartNoAxesCombined, Info, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { GroupDetailsCard } from "./GroupDetailsCard";
import { GroupIdentityCard } from "./GroupIdentityCard";
import { GroupSectionHeader } from "./GroupSectionHeader";

export function GroupDetailView({
  group,
  selectedKey,
  onSelectionChange,
  titleAction,
  tabAdornments,
  infoActions,
  members,
  events,
  rankings,
}: {
  group: GroupRecordResponse;
  selectedKey: string;
  onSelectionChange: (tab: string) => void;
  titleAction?: ReactNode;
  tabAdornments?: Partial<Record<"info" | "members" | "events", ReactNode>>;
  infoActions?: ReactNode;
  members?: ReactNode;
  events?: ReactNode;
  rankings?: ReactNode;
}) {
  const { t } = useLingui();
  const availableTabs = [
    "info",
    group.canViewMembers && "members",
    group.canViewEvents && "events",
    group.canViewRankings && "rankings",
  ];
  return (
    <>
      <GroupIdentityCard group={group} titleAction={titleAction} />
      <Tabs
        selectedKey={availableTabs.includes(selectedKey) ? selectedKey : "info"}
        onSelectionChange={(key) => onSelectionChange(String(key))}
      >
        <TabBar label={t`Group sections`}>
          <TabTrigger icon={Info} id="info">
            {t`Details`}
            {tabAdornments?.info}
          </TabTrigger>
          {group.canViewMembers ? (
            <TabTrigger icon={UsersRound} id="members">
              {t`Members`}
              {tabAdornments?.members}
            </TabTrigger>
          ) : null}
          {group.canViewEvents ? (
            <TabTrigger icon={CalendarDays} id="events">
              {t`Events`}
              {tabAdornments?.events}
            </TabTrigger>
          ) : null}
          {group.canViewRankings ? (
            <TabTrigger icon={ChartNoAxesCombined} id="rankings">{t`Rankings`}</TabTrigger>
          ) : null}
        </TabBar>
        <Tabs.Panel id="info" className="space-y-4 pt-0">
          <GroupSectionHeader group={group} section="info" />
          <GroupDetailsCard group={group} identity={null} venueHelp={false} />
          {infoActions}
        </Tabs.Panel>
        {group.canViewMembers ? (
          <Tabs.Panel id="members" className="space-y-4 pt-0">
            <GroupSectionHeader group={group} section="members" />
            {members}
          </Tabs.Panel>
        ) : null}
        {group.canViewEvents ? (
          <Tabs.Panel id="events" className="space-y-4 pt-0">
            <GroupSectionHeader group={group} section="events" />
            {events}
          </Tabs.Panel>
        ) : null}
        {group.canViewRankings ? (
          <Tabs.Panel id="rankings" className="px-4 pt-0 sm:px-5">
            {rankings}
          </Tabs.Panel>
        ) : null}
      </Tabs>
    </>
  );
}
