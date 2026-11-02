"use client";

import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupList } from "./GroupList";

export function Groups({
  initialSection = "private",
}: {
  initialSection?: "private" | "public" | "search";
}) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const [section, setSection] = useState<string>(initialSection);
  return (
    <NotificationAttentionScope
      options={options}
      targets={[
        { kind: "group-list", id: "PRIVATE" },
        { kind: "group-list", id: "PUBLIC" },
        { kind: "group-list", id: "search" },
      ]}
    >
      <Tabs selectedKey={section} onSelectionChange={(key) => setSection(String(key))}>
        <Tabs.ListContainer className="mt-2 w-fit max-w-full self-center">
          <Tabs.List aria-label={t`Groups navigation`}>
            <Tabs.Tab id="private">
              {t`Private groups`}
              <NotificationTabBadge target={{ kind: "group-list", id: "PRIVATE" }} />
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="public">
              {t`Public groups`}
              <NotificationTabBadge target={{ kind: "group-list", id: "PUBLIC" }} />
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="search">
              {t`Search`}
              <NotificationTabBadge target={{ kind: "group-list", id: "search" }} />
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="private" className="pt-0">
          <GroupList scope="mine" type="PRIVATE" />
        </Tabs.Panel>
        <Tabs.Panel id="public" className="pt-0">
          <GroupList scope="mine" type="PUBLIC" />
        </Tabs.Panel>
        <Tabs.Panel id="search" className="pt-0">
          <GroupList scope="public" />
        </Tabs.Panel>
      </Tabs>
    </NotificationAttentionScope>
  );
}
