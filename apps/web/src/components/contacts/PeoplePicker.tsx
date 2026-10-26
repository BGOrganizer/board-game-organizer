"use client";
import {
  type ContactUser,
  communityAccessDenied,
  useListSearch,
  usePeoplePicker,
} from "@board-game-organizer/shared";
import { Avatar, Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, UserRoundPlus, UsersRound } from "lucide-react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
export function PeoplePicker({
  friendsOnly,
  invitationGroupId,
  disabled = false,
  excludeIds = [],
  onSelect,
  onClose,
}: {
  friendsOnly: boolean;
  invitationGroupId?: string;
  disabled?: boolean;
  excludeIds?: readonly string[];
  onSelect: (person: ContactUser) => void;
  onClose?: () => void;
}) {
  const { t } = useLingui(),
    options = useCommunityApi(),
    filters = useListSearch<never>([]);
  const list = usePeoplePicker(options, filters.search, friendsOnly, invitationGroupId);
  const end = useInfiniteScroll({
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
  });
  const items = communityAccessDenied(list.error)
    ? []
    : list.items.filter(
        (person) => person.id !== options.userId && !excludeIds.includes(person.id),
      );
  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 pb-28">
      {onClose ? (
        <Button isIconOnly variant="ghost" aria-label={t`Back`} onPress={onClose}>
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
      ) : null}
      <ListSearch
        query={filters.query}
        onQueryChange={filters.setQuery}
        label={friendsOnly ? t`Search friends` : t`Search users`}
        placeholder={friendsOnly ? t`Search friends` : t`Search users`}
        options={[]}
        selected={[]}
        onToggle={filters.toggle}
      />
      <GroupedList>
        {items.map((person) => (
          <GroupedRow key={person.id}>
            <Avatar size="md">
              <Avatar.Image src={person.avatarUrl ?? undefined} alt="" />
              <Avatar.Fallback>{person.name.charAt(0)}</Avatar.Fallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{person.name}</span>
              <span className="block truncate text-xs text-default-500">
                {person.username ?? person.email}
              </span>
            </span>
            <Button
              isIconOnly
              size="sm"
              variant="primary"
              aria-label={`${t`Select user`}: ${person.name}`}
              isDisabled={disabled}
              onPress={() => onSelect(person)}
            >
              <UserRoundPlus className="size-4" aria-hidden />
            </Button>
          </GroupedRow>
        ))}
      </GroupedList>
      {list.isPending ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {list.needsSearch ? (
        <p className="text-sm text-default-500">{t`Enter at least 4 characters to search`}</p>
      ) : !list.isPending && !list.isError && !items.length ? (
        <EmptyList icon={<UsersRound className="size-7" />}>
          {friendsOnly ? t`No friends found` : t`No users found`}
        </EmptyList>
      ) : null}
      {list.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load users`}</p>
          <Button variant="outline" onPress={() => void list.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div ref={end} />
      {list.isFetchingNextPage ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : list.hasNextPage ? (
        <Button variant="outline" onPress={() => void list.fetchNextPage()}>
          {list.isFetchNextPageError ? t`Could not load users. Retry` : t`Load more`}
        </Button>
      ) : null}
    </section>
  );
}
