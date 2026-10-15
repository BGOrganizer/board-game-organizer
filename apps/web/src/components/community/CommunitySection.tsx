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
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-4 pt-2">
      <Tabs
        className="w-full"
        selectedKey={selected}
        onSelectionChange={(key) => router.push(key === "groups" ? "/groups" : `/groups/${key}`)}
      >
        <Tabs.ListContainer className="mb-4">
          <Tabs.List aria-label={t`Community`}>
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
        </Tabs.ListContainer>
        <Tabs.Panel id={selected} className="min-h-0">
          {children}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
