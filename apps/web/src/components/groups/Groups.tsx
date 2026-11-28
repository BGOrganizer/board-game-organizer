"use client";

import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Globe, LockKeyhole, Search } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { HEADER_ICON_CLASS, headerControlClassName } from "@/components/common/layout/headerStyles";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useGroupNavigation, useGroupSearchMode } from "./GroupDiscoverySession";
import { GroupList } from "./GroupList";
import { GroupSearch } from "./GroupSearch";

function GroupSearchBack({ onBack }: { onBack: () => void }) {
  const { t } = useLingui();
  return useGroupSearchMode() ? null : (
    <HeaderActions
      back={
        <Link
          href="/groups"
          aria-label={t`Back`}
          className={headerControlClassName}
          onClick={onBack}
        >
          <ArrowLeft className={HEADER_ICON_CLASS} aria-hidden />
        </Link>
      }
    />
  );
}

function GroupTabBarVisibility({
  children,
  ownedSearch,
}: {
  children: ReactNode;
  ownedSearch: boolean;
}) {
  const discovery = useGroupSearchMode();
  return <div hidden={discovery || ownedSearch}>{children}</div>;
}

export function Groups({
  initialSection = "private",
}: {
  initialSection?: "private" | "public" | "search";
}) {
  const { t } = useLingui();
  const { options, section, setSection, closeSearch } = useGroupNavigation();
  const [ownedSearch, setOwnedSearch] = useState(false);
  return (
    <NotificationAttentionScope
      options={options}
      targets={[
        { kind: "group-list", id: "PRIVATE" },
        { kind: "group-list", id: "PUBLIC" },
        { kind: "group-list", id: "search" },
      ]}
    >
      {initialSection === "search" && !ownedSearch ? (
        <GroupSearchBack onBack={() => setSection("private")} />
      ) : null}
      <Tabs
        selectedKey={section}
        onSelectionChange={(key) => {
          if (key === "private" || key === "public" || key === "search") {
            if (section === "search" && key !== "search") closeSearch();
            setSection(key);
          }
        }}
      >
        <GroupTabBarVisibility ownedSearch={ownedSearch}>
          <TabBar label={t`Groups navigation`}>
            <TabTrigger icon={LockKeyhole} id="private">
              {t`Private groups`}
              <NotificationTabBadge target={{ kind: "group-list", id: "PRIVATE" }} />
            </TabTrigger>
            <TabTrigger icon={Globe} id="public">
              {t`Public groups`}
              <NotificationTabBadge target={{ kind: "group-list", id: "PUBLIC" }} />
            </TabTrigger>
            <TabTrigger icon={Search} id="search">
              {t`Search`}
              <NotificationTabBadge target={{ kind: "group-list", id: "search" }} />
            </TabTrigger>
          </TabBar>
        </GroupTabBarVisibility>
        <Tabs.Panel id="private" className="pt-0">
          <GroupList type="PRIVATE" onSearchActiveChange={setOwnedSearch} />
        </Tabs.Panel>
        <Tabs.Panel id="public" className="pt-0">
          <GroupList type="PUBLIC" onSearchActiveChange={setOwnedSearch} />
        </Tabs.Panel>
        <Tabs.Panel id="search" className="pt-0">
          <GroupSearch />
        </Tabs.Panel>
      </Tabs>
    </NotificationAttentionScope>
  );
}
