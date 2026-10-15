"use client";

import type { OrganizationResponse } from "@board-game-organizer/schemas";
import type { CommunityApiOptions } from "../../community/communityApi";
import { useOrganizationMembers } from "./useOrganizations";

/** Walk each source to exhaustion before exposing the next; exclusions always come last. */
export function useOrganizationPeople(
  options: CommunityApiOptions,
  organization: OrganizationResponse,
) {
  const admin = organization.role === "admin";
  const accepted = useOrganizationMembers(options, organization.id);
  const pendingEnabled = admin && accepted.isSuccess && !accepted.hasNextPage;
  const pending = useOrganizationMembers(
    { ...options, enabled: options.enabled !== false && pendingEnabled },
    organization.id,
    "pending",
  );
  const excludedEnabled = pendingEnabled && pending.isSuccess && !pending.hasNextPage;
  const excluded = useOrganizationMembers(
    { ...options, enabled: options.enabled !== false && excludedEnabled },
    organization.id,
    "excluded",
  );
  const pages = [
    accepted,
    ...(pendingEnabled ? [pending] : []),
    ...(excludedEnabled ? [excluded] : []),
  ];
  const next = pages.find((page) => page.hasNextPage);
  return {
    items: pages.flatMap((page) => page.items),
    isPending: pages.some((page) => page.isPending),
    isError: pages.some((page) => page.isError),
    error: pages.find((page) => page.isError)?.error,
    hasNextPage: Boolean(next),
    isFetchingNextPage: pages.some((page) => page.isFetchingNextPage),
    isFetchNextPageError: pages.some((page) => page.isFetchNextPageError),
    fetchNextPage: () => next?.fetchNextPage(),
    refetch: () => {
      for (const page of pages) void page.refetch();
    },
  };
}
