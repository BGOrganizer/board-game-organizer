"use client";

import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Globe, LockKeyhole, Search } from "lucide-react";
import Link from "next/link";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { HEADER_ICON_CLASS, headerControlClassName } from "@/components/common/layout/headerStyles";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useGroupDiscoverySession } from "./GroupDiscoverySession";
import { GroupList } from "./GroupList";
import { GroupSearch } from "./GroupSearch";

export function Groups({
  initialSection = "private",
}: {
  initialSection?: "private" | "public" | "search";
}) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const { section, setSection, search } = useGroupDiscoverySession();
  const searchActive = section === "search" && search.active;
  return (
    <NotificationAttentionScope
      options={options}
      targets={[
        { kind: "group-list", id: "PRIVATE" },
        { kind: "group-list", id: "PUBLIC" },
        { kind: "group-list", id: "search" },
      ]}
    >
      {initialSection === "search" && !searchActive ? (
        <HeaderActions
          back={
            <Link
              href="/groups"
              aria-label={t`Back`}
              className={headerControlClassName}
              onClick={() => setSection("private")}
            >
              <ArrowLeft className={HEADER_ICON_CLASS} aria-hidden />
            </Link>
          }
        />
      ) : null}
      <Tabs
        selectedKey={section}
        onSelectionChange={(key) => {
          if (key === "private" || key === "public" || key === "search") {
            if (key !== "search") search.close();
            setSection(key);
          }
        }}
      >
        <div hidden={searchActive}>
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
        </div>
        <Tabs.Panel id="private" className="pt-0">
          <GroupList type="PRIVATE" />
        </Tabs.Panel>
        <Tabs.Panel id="public" className="pt-0">
          <GroupList type="PUBLIC" />
        </Tabs.Panel>
        <Tabs.Panel id="search" className="pt-0">
          <GroupSearch />
        </Tabs.Panel>
      </Tabs>
    </NotificationAttentionScope>
  );
}
