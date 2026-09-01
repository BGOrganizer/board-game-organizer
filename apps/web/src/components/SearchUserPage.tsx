"use client";

import type { ContactUser, RelationshipRow } from "@board-game-organizer/shared";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { Button, Input, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Search, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  apiUrl: string;
  token: string | null;
  getToken?: () => Promise<string | null>;
  protectionBypass?: string | null;
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
  onSelect,
  onClose,
}: Props) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [friends, setFriends] = useState<RelationshipRow[]>([]);
  const [results, setResults] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the full friends list once (invite picker) — reused as the empty
  // query state and as the source the search narrows.
  useEffect(() => {
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
        const data = (await res.json()) as { relationships: RelationshipRow[] };
        if (active) setFriends(data.relationships);
      } catch {
        if (active) setError(t`Could not load friends`);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiUrl, token, getToken, protectionBypass, t]);

  // Search fires only at >= 4 chars; below that we show the full friends
  // list so the user always has something to pick from.
  useEffect(() => {
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
        if (active) setResults(data.users);
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
  }, [query, apiUrl, token, getToken, protectionBypass, t]);

  const shown =
    query.trim().length >= 4
      ? results
      : friends.map((f) => f.profile).filter((p): p is ContactUser => Boolean(p));

  return (
    <div className="mx-auto w-full max-w-md pb-8">
      <div className="mb-4 flex items-center gap-2">
        <Button isIconOnly variant="ghost" aria-label={t`Back`} onPress={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">{t`Invite friends`}</h2>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t`Search users (at least 4 characters)`}
        startContent={<Search className="h-4 w-4 text-default-400" />}
        endContent={
          query ? (
            <button
              type="button"
              aria-label={t`Clear`}
              onClick={() => setQuery("")}
              className="text-default-400 hover:text-default-600"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null
        }
      />

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
      <div className="mt-3 space-y-2">
        {shown.map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-3 rounded-xl border border-default-200 p-3"
          >
            {u.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatarUrl} alt="" className="h-10 w-10 rounded-full" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-default-100 text-sm font-semibold">
                {u.name?.charAt(0) ?? "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{u.name}</p>
              <p className="truncate text-xs text-default-400">{u.email}</p>
            </div>
            <Button
              size="sm"
              color="primary"
              startContent={<UserPlus className="h-4 w-4" />}
              onPress={() =>
                onSelect({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl })
              }
            >
              {t`Add`}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
