"use client";
import type { EventListSection } from "@board-game-organizer/schemas";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarCheck, CalendarSearch, Flag } from "lucide-react";
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
  onSearchActiveChange,
}: {
  groupId?: string;
  canCreate?: boolean;
  initialSection?: EventListSection;
  onSearchActiveChange?: (active: boolean) => void;
}) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const [section, setSection] = useState<string>(initialSection);
  const [searchActive, setSearchActive] = useState(false);
  if (groupId) {
    return (
      <EventList
        groupId={groupId}
        canCreate={canCreate}
        onSearchActiveChange={onSearchActiveChange}
      />
    );
  }
  return (
    <NotificationAttentionScope
      options={options}
      targets={[
        { kind: "event-list", id: "mine" },
        { kind: "event-list", id: "available" },
        { kind: "event-list", id: "terminated" },
      ]}
    >
      <Tabs selectedKey={section} onSelectionChange={(key) => setSection(String(key))}>
        <div hidden={searchActive} className={searchActive ? undefined : "contents"}>
          <TabBar label={t`Events navigation`}>
            <TabTrigger icon={CalendarCheck} id="mine">
              {t`Scheduled`}
              <NotificationTabBadge target={{ kind: "event-list", id: "mine" }} />
            </TabTrigger>
            <TabTrigger icon={CalendarSearch} id="available">
              {t`Available events`}
              <NotificationTabBadge target={{ kind: "event-list", id: "available" }} />
            </TabTrigger>
            <TabTrigger icon={Flag} id="terminated">
              {t`Terminated events`}
              <NotificationTabBadge target={{ kind: "event-list", id: "terminated" }} />
            </TabTrigger>
          </TabBar>
        </div>
        <Tabs.Panel id="mine" className="pt-0">
          <EventList section="mine" canCreate={canCreate} onSearchActiveChange={setSearchActive} />
        </Tabs.Panel>
        <Tabs.Panel id="available" className="pt-0">
          <EventList
            section="available"
            canCreate={canCreate}
            onSearchActiveChange={setSearchActive}
          />
        </Tabs.Panel>
        <Tabs.Panel id="terminated" className="pt-0">
          <EventList
            section="terminated"
            canCreate={canCreate}
            onSearchActiveChange={setSearchActive}
          />
        </Tabs.Panel>
      </Tabs>
    </NotificationAttentionScope>
  );
}
