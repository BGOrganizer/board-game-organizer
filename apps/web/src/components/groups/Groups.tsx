"use client";

import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { GroupList } from "./GroupList";

export function Groups({ initialSection = "groups" }: { initialSection?: "groups" | "search" }) {
  const { t } = useLingui();
  const [section, setSection] = useState<string>(initialSection);
  return (
    <Tabs selectedKey={section} onSelectionChange={(key) => setSection(String(key))}>
      <Tabs.ListContainer className="mt-4 w-fit max-w-full self-center">
        <Tabs.List aria-label={t`Groups navigation`}>
          <Tabs.Tab id="groups">
            {t`Groups`}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="search">
            {t`Search`}
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id="groups">
        <GroupList scope="mine" />
      </Tabs.Panel>
      <Tabs.Panel id="search">
        <GroupList scope="public" />
      </Tabs.Panel>
    </Tabs>
  );
}
