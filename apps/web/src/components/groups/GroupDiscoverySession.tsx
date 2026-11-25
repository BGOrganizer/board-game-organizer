"use client";

import {
  type CommunityApiOptions,
  type GroupDiscoveryPosition,
  usePublicGroupSearch,
} from "@board-game-organizer/shared";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
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
const Session = createContext<{
  section: Section;
  setSection: (section: Section) => void;
  search: ReturnType<typeof usePublicGroupSearch>;
} | null>(null);

export function useGroupDiscoverySession() {
  const session = useContext(Session);
  if (!session) throw new Error("Groups require a GroupDiscoverySession");
  return session;
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

  useEffect(() => {
    if (directSearch) setSection("search");
  }, [directSearch]);

  return <Session value={{ section, setSection, search }}>{children}</Session>;
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
