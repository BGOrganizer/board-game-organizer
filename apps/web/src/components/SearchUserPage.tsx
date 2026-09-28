"use client";

import type { ContactUser, RelationshipRow } from "@board-game-organizer/shared";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { Avatar, Button, Label, SearchField, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GroupedList, GroupedRow } from "@/components/GroupedList";

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
  const [friends, setFriends] = useState<RelationshipRow[]>([]);
  const [results, setResults] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);
  const friendIds = useMemo(
    () => new Set(friends.flatMap((friend) => (friend.profile ? [friend.profile.id] : []))),
    [friends],
  );

  // Load the full friends list once (invite picker) — reused as the empty
  // query state and as the source the search narrows.
  useEffect(() => {
    if (members) return;
    let active = true;
    (async () => {
      try {
        const t = getToken ? ((await getToken()) ?? token) : token;
        if (!t) return;
        const res = await fetch(
          withProtectionBypass(`${apiUrl}/api/relationships?type=friends`, protectionBypass),
          { headers: { Authorization: `Bearer ${t}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RelationshipRow[];
        if (active) setFriends(data);
      } catch {
        if (active) setError(t`Could not load friends`);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiUrl, token, getToken, protectionBypass, t, members]);

  // Search fires only at >= 4 chars; below that we show the full friends
  // list so the user always has something to pick from.
  useEffect(() => {
    if (members) return;
    if (query.trim().length < 4) {
      setResults([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const t = getToken ? ((await getToken()) ?? token) : token;
        if (!t) return;
        const res = await fetch(
          withProtectionBypass(
            `${apiUrl}/api/users/search?query=${encodeURIComponent(query.trim())}`,
            protectionBypass,
          ),
          { headers: { Authorization: `Bearer ${t}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { users: ContactUser[] };
        if (active) setResults(data.users.filter((user) => friendIds.has(user.id)));
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
  }, [query, apiUrl, token, getToken, protectionBypass, friendIds, t, members]);

  const shown = (
    members
      ? members.filter(
          (user) =>
            query.trim().length < 4 ||
            `${user.name} ${user.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : query.trim().length >= 4
        ? results
        : friends.map((f) => f.profile).filter((p): p is ContactUser => Boolean(p))
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
        <Label className="sr-only">{t`Search users by name or email`}</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={t`Search users (at least 4 characters)`} />
          <SearchField.ClearButton aria-label={t`Clear`} />
        </SearchField.Group>
      </SearchField>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {loading && (
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
    </div>
  );
}
