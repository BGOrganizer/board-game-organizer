"use client";
import type { EventListSection } from "@board-game-organizer/schemas";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
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
  const [section, setSection] = useState<string>(initialSection);
  if (groupId) return <EventList groupId={groupId} canCreate={canCreate} />;
  return (
    <Tabs selectedKey={section} onSelectionChange={(key) => setSection(String(key))}>
      <Tabs.ListContainer className="mt-4 w-fit max-w-full self-center">
        <Tabs.List aria-label={t`Events navigation`}>
          <Tabs.Tab id="mine" className="whitespace-nowrap">
            {t`My events`}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="available" className="whitespace-nowrap">
            {t`Available events`}
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id="mine">
        <EventList section="mine" canCreate={canCreate} />
      </Tabs.Panel>
      <Tabs.Panel id="available">
        <EventList section="available" canCreate={canCreate} />
      </Tabs.Panel>
    </Tabs>
  );
}
