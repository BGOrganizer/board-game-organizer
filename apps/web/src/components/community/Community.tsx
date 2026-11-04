"use client";
import { useAppStore } from "@board-game-organizer/store";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Activity, Store } from "lucide-react";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { CommunityActivities } from "./CommunityActivities";
import { CommunityMarketplace } from "./CommunityMarketplace";

export function Community() {
  const { t } = useLingui(),
    o = useCommunityApi(),
    key = JSON.stringify([o.apiUrl, o.userId]);
  const tab = useAppStore((s) => s.communityViews[key]?.tab ?? "activity"),
    setView = useAppStore((s) => s.setCommunityView);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-24">
      <h1 className="text-lg font-semibold">{t`Community`}</h1>
      <Tabs
        selectedKey={tab}
        onSelectionChange={(value) => {
          if (value === "activity" || value === "market") setView(key, { tab: value });
        }}
      >
        <Tabs.ListContainer className="mt-2 w-full max-w-full self-center">
          <Tabs.List aria-label={t`Community navigation`} className="w-full">
            <Tabs.Tab
              id="activity"
              className="h-auto min-h-11 min-w-0 flex-1 flex-row gap-1 px-1 text-xs whitespace-nowrap sm:gap-2 sm:px-2 sm:text-sm"
            >
              <Activity className="size-4" aria-hidden />
              {t`Activities`}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab
              id="market"
              className="h-auto min-h-11 min-w-0 flex-1 flex-row gap-1 px-1 text-xs whitespace-nowrap sm:gap-2 sm:px-2 sm:text-sm"
            >
              <Store className="size-4" aria-hidden />
              {t`Marketplace`}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="activity" className="pt-0">
          <CommunityActivities />
        </Tabs.Panel>
        <Tabs.Panel id="market" className="pt-0">
          <CommunityMarketplace />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
