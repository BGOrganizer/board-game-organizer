"use client";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { TableList } from "./TableList";

export function Tables() {
  const { t } = useLingui();
  const [section, setSection] = useState<string>("mine");
  return (
    <Tabs selectedKey={section} onSelectionChange={(key) => setSection(String(key))}>
      <Tabs.ListContainer className="mt-4 w-fit max-w-full self-center">
        <Tabs.List aria-label={t`Tables navigation`}>
          <Tabs.Tab id="mine" className="whitespace-nowrap">
            {t`My tables`}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="waiting" className="whitespace-nowrap">
            {t`Pending tables`}
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id="mine">
        <TableList section="mine" />
      </Tabs.Panel>
      <Tabs.Panel id="waiting">
        <TableList section="waiting" />
      </Tabs.Panel>
    </Tabs>
  );
}
