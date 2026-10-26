"use client";

import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, ListBox, Select, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleOff } from "lucide-react";
import { useState } from "react";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GroupArtwork } from "@/components/groups/GroupArtwork";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventGroupSelect({
  groupId,
  group,
  locked,
  busy,
  onChange,
}: {
  groupId: string | null;
  group?: GroupRecordResponse;
  locked: boolean;
  busy: boolean;
  onChange: (id: string | null) => void;
}) {
  const { t } = useLingui(),
    options = useCommunityApi();
  const [open, setOpen] = useState(false);
  const search = useListSearch<never>([]);
  const groups = useGroupRecords(
    { ...options, enabled: options.enabled !== false && open && !locked },
    "mine",
    search.search,
    ["admin"],
  );
  const loadMore = () => groups.fetchNextPage({ cancelRefetch: false });
  const denied = communityAccessDenied(groups.error);
  const rows = denied ? [] : groups.items.filter((row) => row.canInvite);
  if (group && !denied && !rows.some((row) => row.id === group.id)) rows.unshift(group);
  return (
    <Select
      aria-label={t`Group`}
      name="groupId"
      className="w-full"
      isDisabled={busy || locked}
      value={groupId ?? "none"}
      isOpen={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) search.setQuery("");
      }}
      onChange={(value) => {
        if (!locked && !busy && value !== null) onChange(value === "none" ? null : String(value));
      }}
    >
      <Select.Trigger className="w-full">
        <Select.Value className="min-w-0 flex-1 truncate text-left">
          {() => (group && !denied ? group.name : groupId ? t`Group` : t`No group`)}
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <SearchInput
          value={search.query}
          onChange={search.setQuery}
          placeholder={t`Search groups`}
          label={
            <SearchHelpLabel
              label={t`Search groups`}
              help={t`Type at least 4 characters to search`}
            />
          }
        />
        <ListBox
          aria-label={t`Groups`}
          className="max-h-80 overflow-y-auto"
          onScroll={({ currentTarget }) => {
            if (
              currentTarget.scrollHeight - currentTarget.scrollTop - currentTarget.clientHeight <
                160 &&
              groups.hasNextPage &&
              !groups.isFetchingNextPage &&
              !groups.isFetchNextPageError
            )
              void loadMore();
          }}
        >
          <ListBox.Item id="none" textValue={t`No group`}>
            <CircleOff aria-hidden className="size-5" />
            <span>{t`No group`}</span>
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {rows.map((row) => (
            <ListBox.Item
              key={row.id}
              id={row.id}
              textValue={row.name}
              isDisabled={!row.canInvite}
              className="[content-visibility:auto] [contain-intrinsic-size:auto_6rem]"
            >
              <GroupArtwork group={row} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{row.name}</span>
                <span className="text-xs text-default-500">
                  {row.type === "PUBLIC" ? t`Public` : t`Private`}
                </span>
              </span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
        {groups.isPending || groups.isFetchingNextPage ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : null}
        {groups.isError ? (
          <div role="alert">
            <p className="text-danger">{t`Could not load groups`}</p>
            <Button
              variant="outline"
              onPress={() => void (groups.isFetchNextPageError ? loadMore() : groups.refetch())}
            >{t`Try again`}</Button>
          </div>
        ) : !groups.isPending && !rows.length ? (
          <p className="text-sm text-default-500">{t`No groups found`}</p>
        ) : null}
        {groups.hasNextPage ? (
          <Button
            variant="outline"
            isDisabled={groups.isFetchingNextPage}
            onPress={() => void loadMore()}
          >{t`Load more groups`}</Button>
        ) : null}
      </Select.Popover>
    </Select>
  );
}
