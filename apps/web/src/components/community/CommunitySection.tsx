"use client";

import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function CommunitySection({
  selected,
  children,
}: {
  selected: "groups" | "organizations" | "search";
  children: ReactNode;
}) {
  const { t } = useLingui();
  const router = useRouter();
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Tabs
        selectedKey={selected}
        onSelectionChange={(key) => router.push(key === "groups" ? "/groups" : `/groups/${key}`)}
      >
        <Tabs.List aria-label={t`Groups and organizations`}>
          <Tabs.Tab id="groups">
            {t`Groups`}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="organizations">
            {t`Organizations`}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="search">
            {t`Search`}
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel id={selected} className="min-h-0">
          {children}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
