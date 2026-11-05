"use client";
import { useAppStore } from "@board-game-organizer/store";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Activity, Store } from "lucide-react";
import { TabBar } from "@/components/common/ui/TabBar";
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
        <TabBar label={t`Community navigation`}>
          <Tabs.Tab id="activity" className="flex-row gap-2 whitespace-nowrap">
            <Activity className="size-4" aria-hidden />
            {t`Activities`}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="market" className="flex-row gap-2 whitespace-nowrap">
            <Store className="size-4" aria-hidden />
            {t`Marketplace`}
            <Tabs.Indicator />
          </Tabs.Tab>
        </TabBar>
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
