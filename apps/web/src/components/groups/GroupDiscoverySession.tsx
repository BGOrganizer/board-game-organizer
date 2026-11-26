"use client";

import {
  type CommunityApiOptions,
  type GroupDiscoveryPosition,
  usePublicGroupSearch,
} from "@board-game-organizer/shared";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useCommunityApi } from "@/lib/useCommunityApi";

function requestPosition() {
  return new Promise<GroupDiscoveryPosition | null>((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  });
}

type Section = "private" | "public" | "search";
const GroupNavigation = createContext<{
  section: Section;
  setSection: (section: Section) => void;
  searchActive: boolean;
  closeSearch: () => void;
} | null>(null);
const GroupDiscovery = createContext<ReturnType<typeof usePublicGroupSearch> | null>(null);

export function useGroupNavigation() {
  const session = useContext(GroupNavigation);
  if (!session) throw new Error("Groups require a GroupDiscoverySession");
  return session;
}

export function useGroupDiscoverySearch() {
  const search = useContext(GroupDiscovery);
  if (!search) throw new Error("Group search requires a GroupDiscoverySession");
  return search;
}

function ScopedSession({
  options,
  children,
}: {
  options: CommunityApiOptions;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const directSearch = pathname === "/groups/search";
  const [section, setSection] = useState<Section>(directSearch ? "search" : "private");
  const visible = directSearch || pathname === "/groups";
  const search = usePublicGroupSearch(
    { ...options, enabled: options.enabled !== false && visible && section === "search" },
    requestPosition,
  );
  const { active, close } = search;
  const navigation = useMemo(
    () => ({
      section,
      setSection,
      searchActive: section === "search" && active,
      closeSearch: close,
    }),
    [section, active, close],
  );

  useEffect(() => {
    if (directSearch) setSection("search");
  }, [directSearch]);

  return (
    <GroupNavigation value={navigation}>
      <GroupDiscovery value={search}>{children}</GroupDiscovery>
    </GroupNavigation>
  );
}

/** Keep the search in memory while visiting a Group from the results. */
export function GroupDiscoverySession({ children }: { children: ReactNode }) {
  const options = useCommunityApi();
  return (
    <ScopedSession key={JSON.stringify([options.apiUrl, options.userId])} options={options}>
      {children}
    </ScopedSession>
  );
}
