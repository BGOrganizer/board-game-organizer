"use client";
import {
  communityAccessDenied,
  useOrganizationList,
  usePublicGroups,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

import { useEffect, useState } from "react";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function CommunityDiscovery() {
  const { t } = useLingui();
  const options = useCommunityApi();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [groupsEnabled, setGroupsEnabled] = useState(true);
  const [organizationsEnabled, setOrganizationsEnabled] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const groups = usePublicGroups(
    { ...options, enabled: options.enabled !== false && groupsEnabled },
    search,
  );
  const organizations = useOrganizationList(
    { ...options, enabled: options.enabled !== false && organizationsEnabled },
    "public",
    search,
  );
  const g = groupsEnabled && search && !communityAccessDenied(groups.error) ? groups.items : [];
  const o =
    organizationsEnabled && search && !communityAccessDenied(organizations.error)
      ? organizations.items
      : [];
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-28">
      <TextField value={query} onChange={setQuery}>
        <Label>{t`Search groups and organizations`}</Label>
        <div className="flex gap-2">
          <Input name="community-search" autoComplete="off" maxLength={120} />
          <Button
            variant="ghost"
            aria-label={t`Clear search`}
            onPress={() => setQuery("")}
          >{t`Clear`}</Button>
        </div>
      </TextField>
      <div className="flex gap-2">
        <Button
          size="sm"
          aria-pressed={groupsEnabled}
          variant={groupsEnabled ? "primary" : "outline"}
          onPress={() => setGroupsEnabled(!groupsEnabled)}
        >{t`Groups`}</Button>
        <Button
          size="sm"
          aria-pressed={organizationsEnabled}
          variant={organizationsEnabled ? "primary" : "outline"}
          onPress={() => setOrganizationsEnabled(!organizationsEnabled)}
        >{t`Organizations`}</Button>
      </div>
      {!search ? <p>{t`Enter at least 4 characters to search`}</p> : null}
      {search &&
      ((groupsEnabled && groups.isPending) || (organizationsEnabled && organizations.isPending)) ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : null}
      {g.map((group) => (
        <div key={group.id} className="rounded-xl border border-border p-4">
          <p className="font-semibold">{group.name}</p>
          <p>
            {t`Public group`} · {group.memberCount} {t`members`}
          </p>
          <p className="text-sm text-default-500">{t`Group join requests will be available later`}</p>
        </div>
      ))}
      {o.map((org) => (
        <LinkedListCard
          key={org.id}
          href={`/organizations/${org.id}`}
          label={`${t`Open organization`}: ${org.name}`}
        >
          <span className="font-semibold">{org.name}</span>
        </LinkedListCard>
      ))}
      {search &&
      (!groupsEnabled || !groups.isPending) &&
      (!organizationsEnabled || !organizations.isPending) &&
      !g.length &&
      !o.length &&
      !groups.isError &&
      !organizations.isError ? (
        <p>{t`No results found`}</p>
      ) : null}
      {[groupsEnabled ? groups : null, organizationsEnabled ? organizations : null].map((list) =>
        list && search ? (
          <div key={list === groups ? "groups" : "organizations"}>
            {list.isError ? (
              <div role="alert">
                <p>{t`Search failed`}</p>
                <Button variant="outline" onPress={() => void list.refetch()}>{t`Retry`}</Button>
              </div>
            ) : null}
            {list.hasNextPage ? (
              <Button
                isDisabled={list.isFetchingNextPage}
                onPress={() => void list.fetchNextPage()}
              >{t`Load more`}</Button>
            ) : null}
            {list.isFetchingNextPage ? <Skeleton className="h-16 w-full rounded-xl" /> : null}
          </div>
        ) : null,
      )}
    </section>
  );
}
