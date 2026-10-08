"use client";

import {
  type ContactUser,
  useRelationshipList,
  withProtectionBypass,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar, Button, SearchField, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

interface Props {
  apiUrl: string;
  token: string | null;
  getToken?: () => Promise<string | null>;
  protectionBypass?: string | null;
  excludeIds?: string[];
  members?: Array<{ id: string; name: string; email: string | null; avatarUrl: string | null }>;
  onSelect: (user: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  }) => void;
  onClose: () => void;
}

/**
 * Friend-picker page (wizard step 2). Only FRIENDS of the creator are
 * selectable — the API returns mutual-follow users only. Search fires once
 * the query has >= 4 characters (product rule).
 */
export function SearchUserPage({
  apiUrl,
  token,
  getToken,
  protectionBypass,
  excludeIds = [],
  members,
  onSelect,
  onClose,
}: Props) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const { userId } = useAuth();
  const friends = useRelationshipList(
    apiUrl,
    token,
    getToken,
    protectionBypass,
    userId,
    "friends",
    !members,
  );
  const [results, setResults] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);
  const endRef = useInfiniteScroll({
    hasNextPage: !members && query.trim().length < 4 && friends.hasNextPage,
    isFetchingNextPage: friends.isFetchingNextPage,
    isFetchNextPageError: friends.isFetchNextPageError,
    fetchNextPage: friends.fetchNextPage,
  });

  // Search fires only at >= 4 chars; below that we show the full friends
  // list so the user always has something to pick from.
  useEffect(() => {
    if (members) return;
    if (query.trim().length < 4) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const t = getToken ? await getToken() : token;
        if (!t) throw new Error("Authentication required");
        const res = await fetch(
          withProtectionBypass(
            `${apiUrl}/api/users/search?query=${encodeURIComponent(query.trim())}`,
            protectionBypass,
          ),
          { headers: { Authorization: `Bearer ${t}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { users: ContactUser[] };
        if (active) setResults(data.users.filter((user) => user.isFriend));
      } catch {
        if (active) setError(t`Search failed`);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, apiUrl, token, getToken, protectionBypass, t, members]);

  const shown = (
    members
      ? members.filter(
          (user) =>
            query.trim().length < 4 ||
            `${user.name} ${user.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : query.trim().length >= 4
        ? results
        : (friends.data ?? []).map((f) => f.profile).filter((p): p is ContactUser => Boolean(p))
  ).filter((user) => !excludeSet.has(user.id));

  return (
    <div className="mx-auto w-full max-w-5xl pb-8">
      <div className="mb-4 flex items-center gap-2">
        <Button isIconOnly variant="ghost" aria-label={t`Back`} onPress={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">
          {members ? t`Invite group members` : t`Invite friends`}
        </h2>
      </div>

      <SearchField fullWidth value={query} onChange={setQuery}>
        <SearchHelpLabel
          label={t`Search users by name or email`}
          help={t`Type at least 4 characters to search`}
        />
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={t`Search users`} />
          <SearchField.ClearButton aria-label={t`Clear`} />
        </SearchField.Group>
      </SearchField>

      {(error || (!members && friends.isError)) && (
        <p className="mt-2 text-sm text-danger">{error || t`Could not load friends`}</p>
      )}
      {!members && friends.isError && !friends.data && (
        <Button variant="ghost" onPress={() => void friends.refetch()}>{t`Retry`}</Button>
      )}
      {(loading || (!members && friends.isPending)) && (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      )}
      {!loading && shown.length === 0 && query.trim().length >= 4 && (
        <p className="mt-3 text-sm text-default-500">{t`No users found`}</p>
      )}
      <GroupedList className="mt-3">
        {shown.map((u) => (
          <GroupedRow key={u.id}>
            <Avatar size="md" color="accent">
              <Avatar.Image src={u.avatarUrl ?? undefined} alt={u.name} />
              <Avatar.Fallback>{u.name.charAt(0) || "?"}</Avatar.Fallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{u.name}</p>
              <p className="truncate text-xs text-default-400">{u.email}</p>
            </div>
            <Button
              isIconOnly
              className="shrink-0"
              size="sm"
              variant="primary"
              aria-label={`${t`Add`}: ${u.name}`}
              onPress={() =>
                onSelect({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl })
              }
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </GroupedRow>
        ))}
      </GroupedList>
      {!members && query.trim().length < 4 && (
        <>
          <div ref={endRef} aria-hidden="true" />
          {friends.isFetchingNextPage && <Skeleton className="mt-3 h-12 w-full rounded-lg" />}
          {friends.isFetchNextPageError && (
            <Button variant="ghost" onPress={() => void friends.fetchNextPage()}>{t`Retry`}</Button>
          )}
        </>
      )}
    </div>
  );
}
