"use client";
import type { OrganizationMemberResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useListSearch,
  useOrganizationMembers,
} from "@board-game-organizer/shared";
import { Avatar, Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, UsersRound } from "lucide-react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

export function OrganizationMemberPicker({
  organizationId,
  title,
  isDisabled,
  onSelect,
  onClose,
}: {
  organizationId: string;
  title: string;
  isDisabled?: (member: OrganizationMemberResponse) => boolean;
  onSelect: (member: OrganizationMemberResponse) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const search = useListSearch<string>([]);
  const members = useOrganizationMembers(
    useCommunityApi(),
    organizationId,
    "accepted",
    search.search,
  );
  const sentinel = useInfiniteScroll({
    hasNextPage: members.hasNextPage,
    isFetchingNextPage: members.isFetchingNextPage,
    isFetchNextPageError: members.isFetchNextPageError,
    fetchNextPage: members.fetchNextPage,
  });
  return (
    <section className="mx-auto max-w-3xl space-y-3 pb-28">
      <header className="flex items-center gap-2">
        <Button
          isIconOnly
          variant="ghost"
          className="min-h-11 min-w-11"
          aria-label={t`Back`}
          onPress={onClose}
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <h1 className="text-xl font-semibold">{title}</h1>
      </header>
      <ListSearch
        label={t`Organization members`}
        placeholder={t`Search organization members`}
        query={search.query}
        onQueryChange={search.setQuery}
        options={[]}
        selected={[]}
        onToggle={search.toggle}
      />
      <GroupedList>
        {(communityAccessDenied(members.error) ? [] : members.items).map((member) => (
          <GroupedRow key={member.userId}>
            <Button
              variant="ghost"
              className="h-auto min-h-11 w-full justify-start"
              isDisabled={isDisabled?.(member)}
              onPress={() => onSelect(member)}
              aria-label={member.username ?? member.name ?? t`Username unavailable`}
            >
              <Avatar size="md">
                <Avatar.Image src={member.avatarUrl ?? undefined} alt="" />
                <Avatar.Fallback>
                  {(member.name ?? member.username ?? "?").charAt(0)}
                </Avatar.Fallback>
              </Avatar>
              <span className="min-w-0 text-left">
                <span className="block truncate">
                  {member.name ?? member.username ?? t`Username unavailable`}
                </span>
                <span className="block truncate text-xs text-default-500">{member.username}</span>
              </span>
            </Button>
          </GroupedRow>
        ))}
      </GroupedList>
      {members.isPending || members.isFetchingNextPage ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : null}
      {members.isError ? (
        <div role="alert">
          <p>{t`Could not load organization members`}</p>
          <Button onPress={() => void members.refetch()}>{t`Retry`}</Button>
        </div>
      ) : null}
      {!members.isPending && !members.isError && !members.items.length ? (
        <EmptyList icon={<UsersRound className="size-7" />}>{t`No members found`}</EmptyList>
      ) : null}
      <div ref={sentinel} />
      {members.hasNextPage ? (
        <Button
          onPress={() => void members.fetchNextPage()}
          isDisabled={members.isFetchingNextPage}
        >{t`Load more`}</Button>
      ) : null}
    </section>
  );
}
