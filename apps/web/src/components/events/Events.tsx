"use client";
import type { EventListSection } from "@board-game-organizer/schemas";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarCheck, CalendarSearch } from "lucide-react";
import { useState } from "react";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventList } from "./EventList";

export function Events({
  groupId,
  canCreate = true,
  initialSection = "mine",
}: {
  groupId?: string;
  canCreate?: boolean;
  initialSection?: EventListSection;
}) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const [section, setSection] = useState<string>(initialSection);
  if (groupId) return <EventList groupId={groupId} canCreate={canCreate} />;
  return (
    <NotificationAttentionScope
      options={options}
      targets={[
        { kind: "event-list", id: "mine" },
        { kind: "event-list", id: "available" },
      ]}
    >
      <Tabs selectedKey={section} onSelectionChange={(key) => setSection(String(key))}>
        <TabBar label={t`Events navigation`}>
          <TabTrigger icon={CalendarCheck} id="mine">
            {t`Registered events`}
            <NotificationTabBadge target={{ kind: "event-list", id: "mine" }} />
            <Tabs.Indicator />
          </TabTrigger>
          <TabTrigger icon={CalendarSearch} id="available">
            {t`Available events`}
            <NotificationTabBadge target={{ kind: "event-list", id: "available" }} />
            <Tabs.Indicator />
          </TabTrigger>
        </TabBar>
        <Tabs.Panel id="mine" className="pt-0">
          <EventList section="mine" canCreate={canCreate} />
        </Tabs.Panel>
        <Tabs.Panel id="available" className="pt-0">
          <EventList section="available" canCreate={canCreate} />
        </Tabs.Panel>
      </Tabs>
    </NotificationAttentionScope>
  );
}
